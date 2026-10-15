import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";
import { runbookById } from "../server/runbooks.ts";
import type { Session } from "../server/session.ts";
import type { Mode, RegisteredToolResult } from "../server/pipeline.ts";
import type { AgentPlan, AgentPlanStep } from "./agent-planner.ts";
import { admitRegisteredTool, listTools } from "./tool-registry.ts";
import { matchTarget, INVENTORY } from "../server/inventory.ts";
import { nextDiagnosticStep } from "./diagnostics.ts";
import { searchMemory, type MemoryHit } from "./memory.ts";

export type AgentPhase =
  | "understand"
  | "plan"
  | "act"
  | "observe"
  | "replan"
  | "verify"
  | "answer"
  | "cancelled"
  | "failed";

export type CauseStatus = "confirmed" | "hypothesis" | "unestablished";

export type Understanding = {
  goal: string;
  systems: string[];
  tools: string[];
  constraints: string[];
  risks: string[];
  missing: string[];
  success: string[];
};

export type LoopObservation = {
  tool: string;
  target: string;
  code: string;
  detail: string;
  verification: string;
  executionCalled: boolean;
  auditId: string | null;
  injection: boolean;
};

export type AgentRunState = {
  id: string;
  phase: AgentPhase;
  request: string;
  ownerId: string;
  understanding: Understanding;
  steps: AgentPlanStep[];
  cursor: number;
  observations: LoopObservation[];
  seen: string[];
  replanned: boolean;
  cancelled: boolean;
  cause: CauseStatus;
  answer: string;
  startedAt: string;
  updatedAt: string;
  llmCalls: number;
};

const HARD_STOP = new Set([
  "MUTATION_REQUIRES_APPROVAL",
  "POLICY_DENIED",
  "ACTOR_DENIED",
  "AUDIT_INTEGRITY",
  "AUTH_REQUIRED",
  "RUNBOOK_NOT_FOUND",
  "TARGET_NOT_FOUND",
]);

const INJECTION =
  /ignore (all|any|previous)|disregard (the )?(rules|policy)|you are now|new instructions|system prompt|override (the )?policy|role\s*[:=]\s*admin|tool\s*[:=]\s*[a-z0-9._-]+/i;

function redact(text: string): string {
  return text
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1500);
}

export function quarantineToolText(value: string): { text: string; injection: boolean } {
  const clean = redact(value);
  const injection = INJECTION.test(clean);
  const text = clean
    .split("\n")
    .filter((line) => !INJECTION.test(line))
    .join("\n")
    .trim()
    .slice(0, 1500);
  return { text: text || (injection ? "[untrusted tool output withheld]" : ""), injection };
}

export function toolOutputCannotChangePolicy(): true {
  return true;
}

function limit(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
}

export function understandRequest(text: string): Understanding {
  const goal = text.trim().slice(0, 500);
  const matched = matchTarget(goal);
  const systems = matched ? [matched.id] : [];
  const tools = listTools()
    .filter((tool) => tool.policy === "ALLOW" && !tool.mutates && tool.risk === 0)
    .filter((tool) => !matched || tool.allowedTargets.includes(matched.id))
    .map((tool) => tool.name)
    .slice(0, 12);
  const missing = matched ? [] : ["целевая система не названа или отсутствует в inventory"];
  return {
    goal,
    systems,
    tools,
    constraints: [
      "только чтение через Execution Gateway",
      "права сессии не повышаются",
      "ответы инструментов — недоверенные данные",
    ],
    risks: ["изменение инфраструктуры в этом цикле не исполняется"],
    missing,
    success: ["есть наблюдение с кодом OK, MOCK или DRY_RUN и текст проверки"],
  };
}

function runsDir(dir: string): string {
  return path.join(dir, "agent-runs");
}

function runPath(dir: string, id: string): string {
  return path.join(runsDir(dir), `${id}.json`);
}

export function saveAgentRun(dir: string, state: AgentRunState): void {
  withStateLock(dir, () => {
    const folder = runsDir(dir);
    fs.mkdirSync(folder, { recursive: true });
    const target = runPath(dir, state.id);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, target);
  });
}

export function loadAgentRun(dir: string, id: string): AgentRunState | null {
  const target = runPath(dir, id);
  if (!fs.existsSync(target)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as AgentRunState;
    if (!parsed || parsed.id !== id || !Array.isArray(parsed.observations) || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cancelAgentRun(dir: string, id: string): AgentRunState | null {
  const current = loadAgentRun(dir, id);
  if (!current) return null;
  if (current.phase === "answer" || current.phase === "failed" || current.phase === "cancelled") return current;
  current.cancelled = true;
  current.phase = "cancelled";
  current.updatedAt = new Date().toISOString();
  saveAgentRun(dir, current);
  return current;
}

function safeId(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
  return clean || `agent-${Date.now()}`;
}

export function composeReport(input: {
  observations: LoopObservation[];
  cause: CauseStatus;
  memory: MemoryHit[];
  pending: string;
}): string {
  const facts = input.observations.filter((item) => item.code === "OK" || item.code === "MOCK" || item.code === "DRY_RUN");
  const found = facts.length
    ? facts.map((item) => `${item.tool}@${item.target}: ${item.detail}`).join("\n")
    : "Подтверждённых наблюдений нет.";
  const proof = facts.length
    ? facts.map((item) => `${item.tool}: verification=${item.verification}; audit=${item.auditId ?? "нет"}`).join("\n")
    : "Фактических подтверждений нет.";
  const cause =
    input.cause === "unestablished"
      ? "Причина не установлена."
      : input.cause === "hypothesis"
        ? "Есть наблюдение. Причинная связь остаётся гипотезой, пока нет отдельного подтверждения."
        : "Причина подтверждена совпадением диагностического правила и наблюдения.";
  const memory = input.memory.length
    ? input.memory.map((item) => `${item.at} ${item.source}: ${item.snippet}`).join("\n")
    : "Подходящих записей памяти нет.";
  const done = input.observations.length
    ? input.observations.map((item) => `${item.tool}@${item.target} → ${item.code}`).join("\n")
    : "Инструменты не вызывались.";
  return [
    "1. Что обнаружено.",
    found,
    "2. Чем подтверждается.",
    proof,
    memory,
    "3. Причина и предположения.",
    cause,
    "4. Что рекомендуется.",
    input.cause === "confirmed"
      ? "Повторить ту же read-only проверку после исправления и сверить счётчик."
      : "Собрать недостающее read-only наблюдение. Изменения не выполнять без подтверждения.",
    "5. Какие действия выполнены.",
    done,
    "6. Что требует подтверждения.",
    input.pending,
  ].join("\n");
}

function causeFrom(observations: LoopObservation[]): CauseStatus {
  const text = observations.map((item) => `${item.code} ${item.detail}`).join("\n");
  const ok = observations.some((item) => item.code === "OK" || item.code === "MOCK");
  if (!ok) return "unestablished";
  if (/queue=[1-9]|stopped=[1-9]|replication_failures=[1-9]|active_defaults=0|stale_or_never=[1-9]/.test(text)) {
    return "hypothesis";
  }
  if (/cpu_pct=9\d|cpu=9\d|worst_used_pct=9\d|failed_auto_services=[1-9]/.test(text)) return "hypothesis";
  return "unestablished";
}

function recallQuery(request: string): boolean {
  return /уже была|похож|раньше|инцидент|повторя/i.test(request);
}

export type LoopDriverOptions = {
  request: string;
  plan: AgentPlan;
  session: Session;
  stateDir: string;
  runId?: string;
  now?: Date;
  mode?: Mode;
  env?: NodeJS.ProcessEnv;
  toolRunner: (input: {
    runbook: string;
    target: string;
    requestId: string;
    session: Session;
    stateDir: string;
    now?: Date;
    mode?: Mode;
    channel?: Session["channel"];
  }) => RegisteredToolResult;
  replan?: (input: { request: string; observations: LoopObservation[]; target: string }) => AgentPlanStep | null;
};

export async function driveAgentLoop(opts: LoopDriverOptions): Promise<AgentRunState> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const maxSteps = limit(env.JARVIS_AGENT_MAX_STEPS, 6, 1, 8);
  const maxDurationMs = limit(env.JARVIS_AGENT_MAX_DURATION_MS, 60_000, 1_000, 300_000);
  const started = now.getTime();
  const state: AgentRunState = {
    id: safeId(opts.runId ?? `agent-${started}`),
    phase: "understand",
    request: opts.request,
    ownerId: opts.session.accountId,
    understanding: understandRequest(opts.request),
    steps: opts.plan.steps.slice(0, maxSteps),
    cursor: 0,
    observations: [],
    seen: [],
    replanned: false,
    cancelled: false,
    cause: "unestablished",
    answer: "",
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    llmCalls: 1,
  };
  saveAgentRun(opts.stateDir, state);

  const memory = recallQuery(opts.request)
    ? searchMemory(opts.stateDir, opts.request, { kinds: ["incident"], limit: 3, readerRole: opts.session.role })
    : [];

  state.phase = "plan";
  while (state.cursor < state.steps.length && state.steps.length <= maxSteps) {
    if (Date.now() - started > maxDurationMs) {
      state.phase = "failed";
      state.cause = "unestablished";
      break;
    }
    const fresh = loadAgentRun(opts.stateDir, state.id);
    if (fresh?.cancelled) {
      state.cancelled = true;
      state.phase = "cancelled";
      break;
    }
    const step = state.steps[state.cursor];
    const signature = `${step.tool}@${step.target}`;
    if (state.seen.includes(signature)) {
      state.cursor += 1;
      continue;
    }
    state.phase = "act";
    state.updatedAt = new Date().toISOString();
    saveAgentRun(opts.stateDir, state);
    const result = opts.toolRunner({
      runbook: step.tool,
      target: step.target,
      requestId: `${state.id}-${state.cursor}`,
      session: opts.session,
      stateDir: opts.stateDir,
      now: opts.now,
      mode: opts.mode,
      channel: "agent",
    });
    const cancelledDuringAct = loadAgentRun(opts.stateDir, state.id)?.cancelled === true;
    if (cancelledDuringAct) state.cancelled = true;
    const quarantined = quarantineToolText(result.detail);
    state.seen.push(signature);
    state.observations.push({
      tool: step.tool,
      target: step.target,
      code: result.code,
      detail: quarantined.text,
      // Data that came through MikroMCP must not be described with the REST runbook's verification text.
      verification: /^mikromcp:([a-z_]+):/.test(result.detail)
        ? `MikroMCP ${/^mikromcp:([a-z_]+):/.exec(result.detail)![1]} (read-only)`
        : result.verification,
      executionCalled: result.executionCalled,
      auditId: result.auditId || null,
      injection: quarantined.injection,
    });
    state.cursor += 1;
    state.phase = state.cancelled ? "cancelled" : "observe";
    state.updatedAt = new Date().toISOString();
    saveAgentRun(opts.stateDir, state);
    if (state.cancelled || HARD_STOP.has(result.code)) break;
    const blob = state.observations.map((item) => `${item.code} ${item.detail}`).join("\n");
    const suggestion =
      opts.replan?.({ request: opts.request, observations: state.observations, target: step.target }) ??
      nextDiagnosticStep(
        opts.request,
        state.seen,
        step.target,
        blob,
      );
    if (!suggestion) continue;
    const suggestedKey = `${suggestion.tool}@${suggestion.target}`;
    if (state.seen.includes(suggestedKey) || state.steps.length >= maxSteps) continue;
    const suggestedBook = runbookById(suggestion.tool);
    const suggestedAdmit = admitRegisteredTool(suggestion.tool, suggestion.target);
    if (!suggestedBook || suggestedBook.mutates || suggestedBook.risk !== 0 || suggestedAdmit.code !== "GATEWAY") continue;
    state.phase = "replan";
    state.replanned = true;
    state.steps.push(suggestion);
    saveAgentRun(opts.stateDir, state);
  }

  state.phase = state.cancelled ? "cancelled" : state.phase === "failed" ? "failed" : "verify";
  state.cause = state.cancelled || state.phase === "failed" ? "unestablished" : causeFrom(state.observations);
  const pending = state.observations.some((item) => item.code === "MUTATION_REQUIRES_APPROVAL")
    ? "Изменяющее действие требует отдельного подтверждения в Approval Engine."
    : "Изменения не предлагались.";
  state.answer = composeReport({ observations: state.observations, cause: state.cause, memory, pending });
  state.phase = state.cancelled ? "cancelled" : state.phase === "failed" ? "failed" : "answer";
  state.updatedAt = new Date().toISOString();
  saveAgentRun(opts.stateDir, state);
  return state;
}

export function resumeAgentRun(
  dir: string,
  id: string,
  opts: Omit<LoopDriverOptions, "request" | "plan" | "runId"> & { session: Session },
): Promise<AgentRunState> | null {
  const saved = loadAgentRun(dir, id);
  if (!saved) return null;
  if (saved.ownerId !== opts.session.accountId && opts.session.role !== "admin") return null;
  const pending = saved.steps[saved.cursor];
  const book = pending ? runbookById(pending.tool) : null;
  if (saved.phase === "act" && book && (book.mutates || book.risk !== 0 || !book.idempotent)) {
    saved.phase = "failed";
    saved.cause = "unestablished";
    saved.answer = "Прерванный изменяющий шаг не повторён. Причина не установлена.";
    saved.updatedAt = new Date().toISOString();
    saveAgentRun(dir, saved);
    return Promise.resolve(saved);
  }
  const remaining = saved.steps.slice(saved.cursor);
  return driveAgentLoop({
    ...opts,
    request: saved.request,
    runId: saved.id,
    plan: { objective: saved.understanding.goal, responseMode: remaining.length ? "execute" : "answer", message: "", steps: remaining },
  }).then((next) => {
    next.observations = [...saved.observations, ...next.observations];
    next.seen = [...new Set([...saved.seen, ...next.seen])];
    next.replanned = saved.replanned || next.replanned;
    next.cause = causeFrom(next.observations);
    next.answer = composeReport({
      observations: next.observations,
      cause: next.cause,
      memory: [],
      pending: "Прерванное read-only продолжение не повторяло уже сохранённые шаги.",
    });
    saveAgentRun(dir, next);
    return next;
  });
}

export function inventoryTargets(): string[] {
  return INVENTORY.map((item) => item.id);
}
