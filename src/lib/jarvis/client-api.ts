import type { Decision } from "@/lib/jarvis/model";
import type { VoiceHearResponse, VoiceTurnResponse } from "@/lib/jarvis/voice/contract";

export type ServerTrace = {
  original: string;
  normalized: string;
  steps: string[];
  constraint: string;
  target: string;
  runbook: string;
  risk: number;
  policy: string;
  mode: string;
  execution: string;
  verification: string;
  audit: string;
};

export type ServerCommand = {
  code: string;
  verdict: "allow" | "deny" | "clarify";
  mode: string;
  executionCalled: boolean;
  auditId: string;
  requestId: string;
  trace: ServerTrace;
  decision: Decision;
  approval: { id: string; phrase: string; expiresAt: number; stage: 1 | 2 } | null;
};

function csrf(): string {
  const match = document.cookie.match(/(?:^|; )jarvis_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function unavailableDecision(reason: string): Decision {
  return {
    id: "unknown",
    title: "Политика недоступна",
    normalized: "unknown",
    risk: 3,
    tool: "—",
    target: "—",
    runbook: null,
    account: "—",
    parameters: [],
    confirmation: "none",
    mutation: false,
    forceDeny: true,
    clarify: false,
    denyReason: reason,
    clarifyReason: null,
    plan: [],
    toolCall: "—",
    consequences: [],
    findings: [],
    recommendation: null,
    durationMs: 0,
    verdict: "deny",
    reason,
    policyNotes: ["Сервер не ответил. Локальное разрешение не выдаётся."],
    previewFindings: false,
  };
}

export async function ensureServerSession(): Promise<{
  ok: boolean;
  code: string;
  executionMode: string;
  role?: string;
  actorId?: string;
  userId?: string;
}> {
  const response = await fetch("/api/session", { credentials: "include" });
  const body = (await response.json()) as {
    executionMode?: string;
    role?: string;
    actorId?: string;
    code?: string;
    userId?: string;
  };
  const code = body.code || (response.ok ? "OK" : "AUTH_REQUIRED");
  return {
    ok: response.ok && code === "OK",
    code,
    executionMode: body.executionMode || "dry-run",
    role: body.role,
    actorId: body.actorId,
    userId: body.userId,
  };
}

export async function postCommand(
  text: string,
  requestId: string,
  approval?: { id: string; confirmation: string },
): Promise<ServerCommand> {
  const response = await fetch("/api/commands", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({
      text,
      request_id: requestId,
      ...(approval ? { approval_id: approval.id, confirmation: approval.confirmation } : {}),
    }),
  });
  const body = (await response.json()) as Partial<ServerCommand> & { code?: string };
  if (!body.decision || !body.trace) {
    const reason = body.code || "политика недоступна";
    return {
      code: body.code || "AUTH_REQUIRED",
      verdict: "deny",
      mode: "dry-run",
      executionCalled: false,
      auditId: "",
      requestId,
      approval: null,
      decision: unavailableDecision(reason),
      trace: {
        original: text,
        normalized: "—",
        steps: ["authenticate"],
        constraint: "нет",
        target: "—",
        runbook: "—",
        risk: 3,
        policy: "DENY",
        mode: "dry-run",
        execution: "не вызывался",
        verification: "нет",
        audit: "—",
      },
    };
  }
  return body as ServerCommand;
}

/** Text and voice share the authenticated deterministic-first AI gateway. */
export async function postConversation(
  text: string,
  requestId: string,
): Promise<(ServerCommand & { kind: "command" }) | { kind: "agent"; code: string; answer: string; executionCalled: boolean }> {
  const response = await fetch("/api/agent", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ text, request_id: requestId }),
  });
  const body = await response.json();
  if (body?.kind === "command" && body.decision && body.trace) return body;
  return {
    kind: "agent",
    code: typeof body?.code === "string" ? body.code : "SCHEMA_INVALID",
    answer: typeof body?.answer === "string" ? body.answer : String(body?.code || "Сервер не ответил."),
    executionCalled: Array.isArray(body?.observations) && body.observations.some((item: { executionCalled?: boolean }) => item?.executionCalled === true),
  };
}

export async function postVoiceHear(wav: Blob, signal?: AbortSignal): Promise<VoiceHearResponse> {
  const response = await fetch("/api/voice", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "audio/wav", "x-jarvis-csrf": csrf() },
    body: wav,
    signal,
  });
  const body = (await response.json()) as Partial<VoiceHearResponse> & { code?: string };
  return {
    code: body.code || (response.ok ? "STT_FAILED" : "AUTH_REQUIRED"),
    text: body.text ?? null,
    raw: body.raw ?? null,
    confidence: body.confidence ?? null,
    message: body.message ?? null,
  };
}

export async function postVoiceTurn(
  text: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<VoiceTurnResponse> {
  const response = await fetch("/api/voice", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ action: "turn", text, request_id: requestId }),
    signal,
  });
  const body = (await response.json()) as Partial<VoiceTurnResponse> & { code?: string };
  if (!body.spoken && !body.command) {
    return {
      code: body.code || "AUTH_REQUIRED",
      spoken: "",
      sentences: [],
      kind: "agent",
      executionCalled: false,
      mode: "dry-run",
      tts: false,
      command: null,
      answer: null,
    };
  }
  return {
    code: body.code || "OK",
    spoken: body.spoken || "",
    sentences: body.sentences ?? [],
    kind: body.kind || "agent",
    executionCalled: Boolean(body.executionCalled),
    mode: body.mode || "dry-run",
    tts: Boolean(body.tts),
    command: body.command ?? null,
    answer: body.answer ?? null,
  };
}

export async function postVoiceSpeak(
  text: string,
  signal?: AbortSignal,
): Promise<{ ok: true; audio: ArrayBuffer } | { ok: false; code: string }> {
  const response = await fetch("/api/voice", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ action: "speak", text }),
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (response.ok && type.includes("audio/")) return { ok: true, audio: await response.arrayBuffer() };
  try {
    const body = (await response.json()) as { code?: string };
    return { ok: false, code: body.code || "TTS_FAILED" };
  } catch {
    return { ok: false, code: "TTS_FAILED" };
  }
}

