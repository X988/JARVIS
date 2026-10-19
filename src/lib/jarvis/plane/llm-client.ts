import { routeModel, type LLMProviderId, type ModelJob } from "./llm.ts";
import { sanitizeLlmText } from "./llm-safety.ts";
import { circuitAllow, circuitFailure, circuitKey, circuitSuccess } from "./llm-circuit.ts";
import {
  cloudContextAllowed,
  contextLimit,
  estimateTokens,
  localOnly,
  modelAttempts,
  recordModelUse,
  withModelSlot,
} from "./model-router.ts";

export type JsonSchema = Record<string, unknown>;

export type LLMJsonResult =
  | {
      ok: true;
      provider: Exclude<LLMProviderId, "unconfigured">;
      model: string;
      value: unknown;
      requestId: string | null;
    }
  | {
      ok: false;
      code:
        | "NOT_CONFIGURED"
        | "MODEL_UNAVAILABLE"
        | "REQUEST_TOO_LARGE"
        | "UPSTREAM_TIMEOUT"
        | "UPSTREAM_ERROR"
        | "INVALID_RESPONSE"
        | "LOCAL_ONLY"
        | "CLOUD_CONTEXT_DENIED";
      detail: string;
      provider: LLMProviderId;
      model: string;
    };

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  return boundedInt(env.JARVIS_LLM_TIMEOUT_MS, 45_000, 2_000, 120_000);
}

function maxPromptChars(env: NodeJS.ProcessEnv): number {
  return boundedInt(env.JARVIS_LLM_MAX_PROMPT_CHARS, 24_000, 1_000, 200_000);
}

function maxOutputTokens(env: NodeJS.ProcessEnv): number {
  return boundedInt(env.JARVIS_LLM_MAX_OUTPUT_TOKENS, 2_000, 128, 16_000);
}

function retries(env: NodeJS.ProcessEnv): number {
  return boundedInt(env.JARVIS_LLM_RETRY_ATTEMPTS, 2, 1, 3);
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonText(text: string): unknown {
  return JSON.parse(stripFence(text));
}

function openAiText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof row.output_text === "string") return row.output_text;
  for (const item of row.output ?? []) {
    for (const part of item.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function anthropicText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as { content?: Array<{ type?: string; text?: unknown }> };
  const parts = (row.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);
  return parts.length ? parts.join("\n") : null;
}

function geminiText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  for (const candidate of row.candidates ?? []) {
    const text = (candidate.content?.parts ?? [])
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
    if (text) return text;
  }
  return null;
}

function ollamaText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as { message?: { content?: unknown }; response?: unknown };
  if (typeof row.message?.content === "string") return row.message.content;
  return typeof row.response === "string" ? row.response : null;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(
  url: string,
  init: RequestInit,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<{ ok: true; body: unknown; requestId: string | null } | { ok: false; code: "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR"; detail: string }> {
  const attempts = retries(env);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("request-id") ??
        response.headers.get("x-goog-request-id");
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (response.ok) return { ok: true, body, requestId };
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < attempts) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await delay(Math.min(2_000, Math.max(100, Number.isFinite(retryAfter) ? retryAfter * 1_000 : attempt * 250)));
        continue;
      }
      return { ok: false, code: "UPSTREAM_ERROR", detail: `LLM upstream HTTP ${response.status}` };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      if (!aborted && attempt < attempts) {
        await delay(attempt * 200);
        continue;
      }
      return {
        ok: false,
        code: aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        detail: aborted ? "LLM request timed out" : "LLM request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, code: "UPSTREAM_ERROR", detail: "LLM request failed" };
}

function providerRequest(
  provider: Exclude<LLMProviderId, "unconfigured">,
  model: string,
  system: string,
  user: string,
  schema: JsonSchema,
  env: NodeJS.ProcessEnv,
): { url: string; init: RequestInit; extract: (body: unknown) => string | null } | null {
  if (provider === "openai") {
    const key = env.OPENAI_API_KEY?.trim();
    if (!key) return null;
    const base = (env.JARVIS_OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
    return {
      url: `${base}/responses`,
      init: {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: system,
          input: [{ role: "user", content: [{ type: "input_text", text: user }] }],
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: "jarvis_json",
              strict: true,
              schema,
            },
          },
        }),
      },
      extract: openAiText,
    };
  }

  if (provider === "anthropic") {
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;
    const base = (env.JARVIS_ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/$/, "");
    return {
      url: `${base}/v1/messages`,
      init: {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": env.JARVIS_ANTHROPIC_VERSION?.trim() || "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens(env),
          temperature: 0,
          system: system + "\nReturn only a JSON object matching the requested schema.",
          messages: [{ role: "user", content: user }],
        }),
      },
      extract: anthropicText,
    };
  }

  if (provider === "gemini") {
    const key = env.GEMINI_API_KEY?.trim();
    if (!key) return null;
    const base = (env.JARVIS_GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const cleanModel = model.replace(/^models\//, "");
    return {
      url: `${base}/models/${encodeURIComponent(cleanModel)}:generateContent`,
      init: {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      },
      extract: geminiText,
    };
  }

  const base = (env.JARVIS_OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  return {
    url: `${base}/api/chat`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    extract: ollamaText,
  };
}

export async function callJsonModel(
  job: ModelJob,
  input: { system: string; user: string; schema: JsonSchema },
  opts: { env?: NodeJS.ProcessEnv; fetch?: FetchLike } = {},
): Promise<LLMJsonResult> {
  const env = opts.env ?? process.env;
  const route = routeModel(job, env);
  const started = Date.now();
  const finish = (result: LLMJsonResult): LLMJsonResult => {
    recordModelUse({
      at: new Date().toISOString(),
      job,
      provider: result.provider,
      model: result.model,
      ok: result.ok,
      durationMs: Date.now() - started,
      estimatedTokens: estimateTokens(input.system + input.user),
      code: result.ok ? "OK" : result.code,
    });
    return result;
  };
  const attempts = modelAttempts(job, env).filter(
    (item) => item.model && item.model !== "unconfigured" && item.model !== "local",
  );
  if (attempts.length === 0) {
    const localBlocked = localOnly(env) && !route.local;
    if (localBlocked || (localOnly(env) && (!route.configured || route.provider === "unconfigured"))) {
      return finish({
        ok: false,
        code: "LOCAL_ONLY",
        detail: "LOCAL_ONLY: локальная модель недоступна, облако не используется",
        provider: route.provider,
        model: route.model,
      });
    }
    if (!route.configured || route.provider === "unconfigured") {
      return finish({
        ok: false,
        code: "NOT_CONFIGURED",
        detail: `LLM provider for ${job} is not configured`,
        provider: route.provider,
        model: route.model,
      });
    }
    return finish({
      ok: false,
      code: "MODEL_UNAVAILABLE",
      detail: `LLM model for ${job} is not configured`,
      provider: route.provider,
      model: route.model,
    });
  }
  const usable = attempts.filter((item) => cloudContextAllowed(job, item.local, env));
  if (usable.length === 0) {
    return finish({
      ok: false,
      code: "CLOUD_CONTEXT_DENIED",
      detail: "Инфраструктурный контекст не отправляется в облако без JARVIS_LLM_CLOUD_INFRA=1",
      provider: route.provider,
      model: route.model,
    });
  }
  const safeSystem = sanitizeLlmText(input.system);
  const safeUser = sanitizeLlmText(input.user);
  if (safeSystem.text.length + safeUser.text.length > Math.min(maxPromptChars(env), contextLimit(env))) {
    return finish({
      ok: false,
      code: "REQUEST_TOO_LARGE",
      detail: "LLM prompt exceeds configured character limit",
      provider: route.provider,
      model: route.model,
    });
  }

  let last: LLMJsonResult = {
    ok: false,
    code: "NOT_CONFIGURED",
    detail: "LLM provider is not configured",
    provider: route.provider,
    model: route.model,
  };
  for (const attempt of usable) {
    const request = providerRequest(attempt.provider, attempt.model, safeSystem.text, safeUser.text, input.schema, env);
    if (!request) continue;
    const key = circuitKey(attempt.provider, attempt.model);
    if (!circuitAllow(key, Date.now(), env)) {
      last = {
        ok: false,
        code: "UPSTREAM_ERROR",
        detail: "LLM circuit breaker is open",
        provider: attempt.provider,
        model: attempt.model,
      };
      continue;
    }
    const response = await withModelSlot(env, () => postJson(request.url, request.init, env, opts.fetch ?? fetch));
    if (!response.ok) {
      circuitFailure(key, Date.now(), env);
      last = { ...response, provider: attempt.provider, model: attempt.model };
      if (response.code === "UPSTREAM_TIMEOUT" || response.code === "UPSTREAM_ERROR") continue;
      return finish(last);
    }
    circuitSuccess(key);
    const text = request.extract(response.body);
    if (!text) {
      last = {
        ok: false,
        code: "INVALID_RESPONSE",
        detail: "LLM response did not contain text",
        provider: attempt.provider,
        model: attempt.model,
      };
      continue;
    }
    try {
      return finish({
        ok: true,
        provider: attempt.provider,
        model: attempt.model,
        value: parseJsonText(text),
        requestId: response.requestId,
      });
    } catch {
      last = {
        ok: false,
        code: "INVALID_RESPONSE",
        detail: "LLM response was not valid JSON",
        provider: attempt.provider,
        model: attempt.model,
      };
    }
  }
  return finish(last);
}
