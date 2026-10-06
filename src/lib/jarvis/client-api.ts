import type { Decision } from "@/lib/jarvis/model";

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

export async function ensureServerSession(accountId: string): Promise<{ executionMode: string; role?: string }> {
  await fetch("/api/session", { credentials: "include" });
  const response = await fetch("/api/session", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ accountId }),
  });
  const body = (await response.json()) as { executionMode?: string; role?: string; code?: string };
  if (!response.ok) throw new Error(body.code || "AUTH_REQUIRED");
  return { executionMode: body.executionMode || "dry-run", role: body.role };
}

export async function postCommand(text: string, requestId: string): Promise<ServerCommand> {
  const response = await fetch("/api/commands", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ text, requestId }),
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
