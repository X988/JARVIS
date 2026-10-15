import { providerDescriptor, routeModel, type LLMProviderId, type ModelJob } from "./llm.ts";

export type ModelPurpose = "dialogue" | "planning" | "logs" | "coding" | "classification" | "report";

const PURPOSE_JOB: Record<ModelPurpose, ModelJob> = {
  dialogue: "intent",
  planning: "research",
  logs: "research",
  coding: "coding",
  classification: "intent",
  report: "sensitive",
};

const INFRA_JOBS = new Set<ModelJob>(["sensitive"]);

export type ModelAttempt = {
  provider: Exclude<LLMProviderId, "unconfigured">;
  model: string;
  local: boolean;
  purpose: ModelPurpose | ModelJob;
};

export type ModelUse = {
  at: string;
  job: string;
  provider: string;
  model: string;
  ok: boolean;
  durationMs: number;
  estimatedTokens: number;
  code: string;
};

const recent: ModelUse[] = [];
let inflight = 0;
const waiters: Array<() => void> = [];

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
}

export function localOnly(env: NodeJS.ProcessEnv): boolean {
  return env.JARVIS_LLM_MODE?.trim().toUpperCase() === "LOCAL_ONLY";
}

export function contextLimit(env: NodeJS.ProcessEnv): number {
  return bounded(env.JARVIS_LLM_CONTEXT_CHARS ?? env.JARVIS_LLM_MAX_PROMPT_CHARS, 24_000, 1_000, 200_000);
}

export function maxConcurrentModels(env: NodeJS.ProcessEnv): number {
  return bounded(env.JARVIS_LLM_MAX_CONCURRENT, 4, 1, 16);
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function providerId(value: string): Exclude<LLMProviderId, "unconfigured"> | null {
  const clean = value.trim().toLowerCase();
  if (clean === "openai" || clean === "anthropic" || clean === "gemini" || clean === "ollama") return clean;
  return null;
}

export function routePurpose(
  purpose: ModelPurpose,
  env: NodeJS.ProcessEnv = process.env,
): { job: ModelJob; provider: LLMProviderId; model: string; local: boolean; configured: boolean; permission: "unchanged" } {
  const job = PURPOSE_JOB[purpose];
  const route = routeModel(job, env);
  return { job, ...route };
}

export function modelAttempts(job: ModelJob, env: NodeJS.ProcessEnv): ModelAttempt[] {
  const primary = routeModel(job, env);
  const chain: ModelAttempt[] = [];
  if (primary.provider !== "unconfigured") {
    chain.push({
      provider: primary.provider,
      model: primary.model,
      local: primary.local,
      purpose: job,
    });
  }
  const failover = (env.JARVIS_LLM_FAILOVER ?? "")
    .split(",")
    .map((item) => providerId(item))
    .filter((item): item is Exclude<LLMProviderId, "unconfigured"> => Boolean(item));
  for (const id of failover) {
    if (chain.some((item) => item.provider === id)) continue;
    const descriptor = providerDescriptor(id, env[`JARVIS_${id.toUpperCase()}_MODEL`] ?? "", env);
    chain.push({
      provider: id,
      model: descriptor.model,
      local: descriptor.local,
      purpose: job,
    });
  }
  return localOnly(env) ? chain.filter((item) => item.local) : chain;
}

export function cloudContextAllowed(job: ModelJob, local: boolean, env: NodeJS.ProcessEnv): boolean {
  if (local || !INFRA_JOBS.has(job)) return true;
  return env.JARVIS_LLM_CLOUD_INFRA === "1";
}

export function recordModelUse(entry: ModelUse): void {
  recent.push(entry);
  if (recent.length > 200) recent.splice(0, recent.length - 200);
}

export function recentModelUse(): readonly ModelUse[] {
  return recent.slice();
}

export function resetModelUse(): void {
  recent.length = 0;
}

export async function withModelSlot<T>(env: NodeJS.ProcessEnv, run: () => Promise<T>): Promise<T> {
  const max = maxConcurrentModels(env);
  while (inflight >= max) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inflight += 1;
  try {
    return await run();
  } finally {
    inflight -= 1;
    waiters.shift()?.();
  }
}

export async function probeOllama(
  env: NodeJS.ProcessEnv,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ ok: boolean; models: string[]; detail: string }> {
  const base = (env.JARVIS_OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${base}/api/tags`, { method: "GET" });
    if (!response.ok) return { ok: false, models: [], detail: `Ollama HTTP ${response.status}` };
    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (body.models ?? []).map((item) => item.name ?? "").filter(Boolean);
    return { ok: true, models, detail: models.length ? models.join(",") : "no models" };
  } catch {
    return { ok: false, models: [], detail: "Ollama недоступна" };
  }
}
