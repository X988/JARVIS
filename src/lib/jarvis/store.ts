import { create } from "zustand";
import { postCommand, unavailableDecision, ensureServerSession, type ServerTrace } from "@/lib/jarvis/client-api";
import { OPERATORS, evaluate, type Decision, type Operator } from "@/lib/jarvis/model";
import type { VoiceTurnResponse } from "@/lib/jarvis/voice/contract";
import { decideToolApproval, runAssistantTurn } from "@/lib/jarvis/tools/api";
import { heuristicPlan } from "@/lib/jarvis/tools/heuristic";
import type { PublicCall } from "@/lib/jarvis/tools/types";
import { WATCH_ALERTS, type WatchAlert } from "@/lib/jarvis/watch";

export type Phase = "running" | "awaiting" | "done" | "denied" | "expired" | "cancelled";

export type Approval = {
  id: string;
  stage: 1 | 2;
  expiresAt: number;
  phrase: string;
};

export type Turn = {
  id: string;
  source: "text" | "voice";
  request: string;
  heard: string | null;
  at: number;
  phase: Phase;
  step: number;
  decision: Decision;
  approval: Approval | null;
  executed: boolean;
  showFindings: boolean;
  dryRun: boolean;
  exitCode: number | null;
  durationMs: number | null;
  hint: string | null;
  replies: string[];
  toolRun?: {
    assistant: string;
    calls: PublicCall[];
    mode: "dry-run" | "live";
  };
  trace: ServerTrace | null;
  serverCode: string | null;
};

export type AuditEntry = {
  id: string;
  at: number;
  user: string;
  source: string;
  request: string;
  intent: string;
  tool: string;
  target: string;
  parameters: string;
  risk: number;
  approvalId: string | null;
  template: string;
  result: string;
  exitCode: number | null;
  durationMs: number | null;
  error: string | null;
};

export type Notice = WatchAlert & { at: number };

type JarvisState = {
  actorId: string;
  authCode: string;
  authUserId: string | null;
  sessionReady: boolean;
  operatorId: string;
  dryRun: boolean;
  serverMode: string;
  watch: boolean;
  busy: boolean;
  now: number;
  seq: number;
  turns: Turn[];
  notices: Notice[];
  audit: AuditEntry[];
  auditEpoch: number;
  setOperator: (id: string) => void;
  setDryRun: (value: boolean) => void;
  setWatch: (value: boolean) => void;
  ensureSession: () => Promise<void>;
  pushNotice: (id: string) => void;
  submit: (raw: string, source: "text" | "voice", heard?: string) => Promise<void>;
  showVoiceResult: (payload: VoiceTurnResponse, heard?: string) => void;
  reply: (turnId: string, phrase: string) => Promise<void>;
  resolveApproval: (approvalId: string, decision: "approve" | "reject") => Promise<void>;
  cancel: (turnId: string) => void;
  tick: (ts: number) => void;
};

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function operatorById(id: string): Operator {
  return OPERATORS.find((item) => item.id === id) ?? OPERATORS[0];
}

function toolDecision(
  text: string,
  operator: Operator,
  remote: { assistant: string; calls: PublicCall[]; mode: "dry-run" | "live" },
): Decision {
  const base = evaluate(text, operator, new Date());
  const change = remote.calls.some((call) => call.risk === "change");
  const waiting = remote.calls.some((call) => call.result === "awaiting_approval");
  return {
    ...base,
    title: remote.calls.length === 1 ? remote.calls[0]?.tool ?? "Инструмент" : "Инструменты",
    risk: change ? 2 : 0,
    tool: remote.calls.map((call) => call.tool).join(", "),
    target: remote.calls.map((call) => call.host).join(", "),
    mutation: change,
    confirmation: waiting ? "single" : "none",
    plan: remote.calls.map((call) => `${call.tool}: ${call.result}`),
    toolCall: remote.calls.map((call) => call.command).join("\n"),
    consequences: [],
    findings: [],
    recommendation: null,
    reason: null,
    policyNotes: [`Режим инструментов: ${remote.mode}`, `Роль: ${operator.role}`, ...base.policyNotes],
    previewFindings: false,
    verdict: "allow",
  };
}

function paramsOf(decision: Decision): string {
  if (decision.parameters.length === 0) return "—";
  return decision.parameters.map((item) => `${item.key}=${item.value}`).join(", ");
}

function auditFrom(
  turn: Turn,
  user: string,
  result: string,
  error: string | null,
  approvalId: string | null,
): AuditEntry {
  return {
    id: uid("aud"),
    at: Date.now(),
    user,
    source: turn.source === "voice" ? "telegram-voice" : "telegram-text",
    request: turn.request,
    intent: turn.decision.normalized,
    tool: turn.decision.tool,
    target: turn.decision.target,
    parameters: paramsOf(turn.decision),
    risk: turn.decision.risk,
    approvalId,
    template: turn.decision.runbook ?? "—",
    result,
    exitCode: turn.exitCode,
    durationMs: turn.durationMs,
    error,
  };
}

let lock = false;

export const useJarvis = create<JarvisState>((set, get) => ({
  actorId: "unauthenticated",
  authCode: "",
  authUserId: null,
  sessionReady: false,
  operatorId: "admin1",
  dryRun: true,
  serverMode: "dry-run",
  watch: true,
  busy: false,
  now: 0,
  seq: 17,
  turns: [],
  notices: [],
  audit: [],
  auditEpoch: 0,

  setOperator: (id) => set({ operatorId: id }),
  setDryRun: (value) => set({ dryRun: value }),
  setWatch: (value) => set({ watch: value }),
  ensureSession: async () => {
    try {
      const session = await ensureServerSession();
      set({
        serverMode: session.executionMode,
        dryRun: session.executionMode !== "real",
        actorId: session.ok ? (session.actorId ?? "authenticated") : "unauthenticated",
        authCode: session.code,
        authUserId: session.userId ?? null,
        sessionReady: true,
      });
    } catch {
      set({
        serverMode: "dry-run",
        dryRun: true,
        actorId: "unauthenticated",
        authCode: "AUTH_REQUIRED",
        authUserId: null,
        sessionReady: true,
      });
    }
  },

  pushNotice: (id) => {
    const state = get();
    if (!state.watch || state.notices.some((item) => item.id === id)) return;
    const alert = WATCH_ALERTS.find((item) => item.id === id);
    if (!alert) return;
    const notice: Notice = { ...alert, at: Date.now() };
    const user = state.actorId;
    const entry: AuditEntry = {
      id: uid("aud"),
      at: notice.at,
      user,
      source: "demo",
      request: notice.title,
      intent: "watch",
      tool: "watch_hosts",
      target: notice.host,
      parameters: notice.area,
      risk: 0,
      approvalId: null,
      template: "—",
      result: "watch_report",
      exitCode: null,
      durationMs: null,
      error: null,
    };
    set({
      notices: [...state.notices, notice],
      audit: [entry, ...state.audit].slice(0, 80),
    });
  },

  tick: (ts) => {
    const state = get();
    const user = state.actorId;
    const extra: AuditEntry[] = [];
    let changed = false;
    const turns = state.turns.map((turn) => {
      if (turn.phase !== "awaiting" || !turn.approval || ts <= turn.approval.expiresAt) return turn;
      changed = true;
      const next: Turn = { ...turn, phase: "expired", hint: "Срок заявки истёк. Повторите команду." };
      extra.push(auditFrom(next, user, "expired", "approval ttl", turn.approval.id));
      return next;
    });
    if (!changed) {
      set({ now: ts });
      return;
    }
    set({ now: ts, turns, audit: [...extra, ...state.audit].slice(0, 80) });
  },

  showVoiceResult: (payload, heard) => {
    const user = get().actorId;
    const at = Date.now();
    if (payload.command) {
      const result = payload.command;
      const request = result.trace.original || heard || payload.spoken;
      const phase: Phase = result.approval ? "awaiting" : result.decision.verdict === "deny" ? "denied" : "done";
      const next: Turn = {
        id: uid("turn"),
        source: "voice",
        request,
        heard: heard && heard.trim() && heard.trim() !== request ? heard.trim() : null,
        at,
        phase,
        step: 4,
        decision: result.decision,
        approval: result.approval
          ? {
              id: result.approval.id,
              stage: result.approval.stage,
              expiresAt: result.approval.expiresAt,
              phrase: result.approval.phrase,
            }
          : null,
        executed: result.executionCalled,
        showFindings: result.decision.verdict === "allow" && result.decision.findings.length > 0,
        dryRun: result.mode !== "real",
        exitCode: result.decision.verdict === "allow" ? 0 : 1,
        durationMs: result.decision.durationMs,
        hint: result.decision.reason,
        replies: [],
        trace: result.trace,
        serverCode: result.code,
      };
      set({
        turns: [...get().turns, next],
        serverMode: result.mode || get().serverMode,
        audit: [auditFrom(next, user, result.code, result.decision.reason, result.approval?.id ?? null), ...get().audit].slice(0, 80),
      });
      return;
    }
    const answer = (payload.answer || payload.spoken || "Ответа нет.").trim();
    const verdict = payload.code === "OK" || payload.code === "DRY_RUN" || payload.code === "CLARIFY" || payload.code === "AGENT_PARTIAL"
      ? "clarify"
      : "deny";
    const decision: Decision = {
      id: "unknown",
      title: answer.length > 180 ? `${answer.slice(0, 177).trimEnd()}…` : answer,
      normalized: "voice-chat",
      risk: 0,
      tool: "разговор",
      target: "—",
      runbook: null,
      account: "—",
      parameters: [],
      confirmation: "none",
      mutation: false,
      forceDeny: verdict === "deny",
      clarify: verdict === "clarify",
      denyReason: verdict === "deny" ? answer : null,
      clarifyReason: verdict === "clarify" ? answer : null,
      plan: [],
      toolCall: "—",
      consequences: [],
      findings: [],
      recommendation: null,
      durationMs: 0,
      verdict,
      reason: answer.length > 180 ? answer : null,
      policyNotes: ["Голосовой ответ. Голос ничего не подтверждает и не выполняет."],
      previewFindings: false,
    };
    const next: Turn = {
      id: uid("turn"),
      source: "voice",
      request: heard?.trim() || "голос",
      heard: null,
      at,
      phase: verdict === "deny" ? "denied" : "done",
      step: 4,
      decision,
      approval: null,
      executed: false,
      showFindings: false,
      dryRun: (payload.mode || get().serverMode) !== "real",
      exitCode: null,
      durationMs: null,
      hint: null,
      replies: [],
      trace: null,
      serverCode: payload.code,
    };
    set({
      turns: [...get().turns, next],
      audit: [auditFrom(next, user, payload.code, null, null), ...get().audit].slice(0, 80),
    });
  },

  resolveApproval: async (approvalId, decision) => {
    const state = get();
    const operator = operatorById(state.operatorId);
    try {
      const result = await decideToolApproval({
        data: { approvalId, decision, operatorId: operator.id },
      });
      set({
        auditEpoch: get().auditEpoch + 1,
        turns: get().turns.map((turn) => {
          if (!turn.toolRun?.calls.some((call) => call.approvalId === approvalId)) return turn;
          const calls = turn.toolRun.calls.map((call) =>
            call.approvalId === approvalId && result.call ? result.call : call,
          );
          const waiting = calls.some((call) => call.result === "awaiting_approval");
          return {
            ...turn,
            toolRun: { ...turn.toolRun, calls },
            phase: waiting ? "awaiting" : "done",
            hint: result.ok ? null : result.error,
            executed: calls.some((call) => call.result === "executed"),
          };
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось записать решение.";
      set({
        turns: get().turns.map((turn) =>
          turn.toolRun?.calls.some((call) => call.approvalId === approvalId) ? { ...turn, hint: message } : turn,
        ),
      });
    }
  },

  cancel: (turnId) => {
    const state = get();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn || turn.phase !== "awaiting") return;
    const next: Turn = { ...turn, phase: "cancelled", hint: "Заявка отменена. Ничего не менялось." };
    const user = state.actorId;
    set({
      turns: state.turns.map((item) => (item.id === turnId ? next : item)),
      audit: [auditFrom(next, user, "cancelled", null, turn.approval?.id ?? null), ...state.audit].slice(0, 80),
    });
  },

  reply: async (turnId, phrase) => {
    const text = phrase.trim();
    if (!text || lock) return;
    const turn = get().turns.find((item) => item.id === turnId);
    if (!turn || turn.phase !== "awaiting" || !turn.approval) return;
    lock = true;
    set({ busy: true });
    try {
      const result = await postCommand(turn.request, uid("req"), {
        id: turn.approval.id,
        confirmation: text,
      });
      const user = get().actorId;
      const phase: Phase = result.approval ? "awaiting" : result.verdict === "deny" ? "denied" : "done";
      const next: Turn = {
        ...turn,
        replies: [...turn.replies, text],
        phase,
        step: 4,
        decision: result.decision,
        approval: result.approval
          ? { id: result.approval.id, stage: result.approval.stage, expiresAt: result.approval.expiresAt, phrase: result.approval.phrase }
          : null,
        executed: result.executionCalled,
        showFindings: result.verdict === "allow",
        dryRun: result.mode !== "real",
        trace: result.trace,
        serverCode: result.code,
        hint: result.decision.reason,
        exitCode: result.verdict === "allow" ? 0 : 1,
        durationMs: result.decision.durationMs,
      };
      set({
        turns: get().turns.map((item) => (item.id === turnId ? next : item)),
        audit: [auditFrom(next, user, result.code, result.decision.reason, result.approval?.id ?? null), ...get().audit].slice(0, 80),
      });
    } finally {
      lock = false;
      set({ busy: false });
    }
  },

  submit: async (raw, source, heard) => {
    const text = raw.trim();
    if (!text || lock) return;
    const pending = get().turns.find((item) => item.phase === "awaiting" && !item.toolRun);
    if (pending && heuristicPlan(text).toolCalls.length === 0) {
      if (/^отмена$/i.test(text) || /^cancel$/i.test(text)) {
        get().cancel(pending.id);
        return;
      }
      await get().reply(pending.id, text);
      return;
    }
    lock = true;
    set({ busy: true });
    try {
      const operator = operatorById(get().operatorId);
      if (!operator.allowed) {
        const decision = evaluate(text, operator, new Date());
        const turn: Turn = {
          id: uid("turn"),
          source,
          request: text,
          heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
          at: Date.now(),
          phase: "denied",
          step: 4,
          decision,
          approval: null,
          executed: false,
          showFindings: false,
          dryRun: true,
          exitCode: 1,
          durationMs: decision.durationMs,
          hint: decision.reason,
          replies: [],
          trace: null,
          serverCode: "ACTOR_DENIED",
        };
        set({
          turns: [...get().turns, turn],
          audit: [auditFrom(turn, operator.name, "denied", decision.reason, null), ...get().audit].slice(0, 80),
        });
        return;
      }
      try {
        const remote = await runAssistantTurn({ data: { message: text, operatorId: operator.id } });
        if (remote.handled) {
          const decision = toolDecision(text, operator, remote);
          const waiting = remote.calls.some((call) => call.result === "awaiting_approval");
          const denied = remote.calls.every((call) => call.result === "denied");
          const turn: Turn = {
            id: uid("turn"),
            source,
            request: text,
            heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
            at: Date.now(),
            phase: waiting ? "awaiting" : denied ? "denied" : "done",
            step: 4,
            decision,
            approval: null,
            executed: remote.calls.some((call) => call.result === "executed"),
            showFindings: false,
            dryRun: remote.mode === "dry-run",
            exitCode: denied ? 1 : 0,
            durationMs: 0,
            hint: null,
            replies: [],
            toolRun: { assistant: remote.assistant, calls: remote.calls, mode: remote.mode },
            trace: null,
            serverCode: null,
          };
          set({ turns: [...get().turns, turn], auditEpoch: get().auditEpoch + 1 });
          return;
        }
      } catch {
        // Policy commands still reach the server if the tool service is unavailable.
      }
      await get().ensureSession();
      const result = await postCommand(text, uid("req")).catch(() => null);
      const decision = result?.decision ?? unavailableDecision("Сервер политики не ответил.");
      const user = get().actorId;
      const next: Turn = {
        id: uid("turn"),
        source,
        request: text,
        heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
        at: Date.now(),
        phase: result?.approval ? "awaiting" : decision.verdict === "deny" ? "denied" : "done",
        step: 4,
        decision,
        approval: result?.approval
          ? { id: result.approval.id, stage: result.approval.stage, expiresAt: result.approval.expiresAt, phrase: result.approval.phrase }
          : null,
        executed: Boolean(result?.executionCalled),
        showFindings: decision.verdict === "allow" && decision.findings.length > 0,
        dryRun: (result?.mode ?? "dry-run") !== "real",
        exitCode: decision.verdict === "allow" ? 0 : 1,
        durationMs: decision.durationMs,
        hint: decision.reason,
        replies: [],
        trace: result?.trace ?? null,
        serverCode: result?.code ?? "AUTH_REQUIRED",
      };
      set({
        turns: [...get().turns, next],
        serverMode: result?.mode ?? get().serverMode,
        audit: [auditFrom(next, user, result?.code ?? "deny", decision.reason, result?.approval?.id ?? null), ...get().audit].slice(0, 80),
      });
    } finally {
      lock = false;
      set({ busy: false });
    }
  },
}));
