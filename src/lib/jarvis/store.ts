import { create } from "zustand";
import { postCommand, unavailableDecision, ensureServerSession, type ServerTrace } from "@/lib/jarvis/client-api";
import { OPERATORS, type Decision, type Operator } from "@/lib/jarvis/model";
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
  setOperator: (id: string) => void;
  setDryRun: (value: boolean) => void;
  setWatch: (value: boolean) => void;
  ensureSession: () => Promise<void>;
  pushNotice: (id: string) => void;
  submit: (raw: string, source: "text" | "voice", heard?: string) => Promise<void>;
  reply: (turnId: string, phrase: string) => Promise<void>;
  cancel: (turnId: string) => void;
  tick: (ts: number) => void;
};

let n = 0;
function uid(prefix: string): string {
  n += 1;
  return `${prefix}-${n}`;
}

function operatorById(id: string): Operator {
  return OPERATORS.find((item) => item.id === id) ?? OPERATORS[0];
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

  setOperator: (id) => set({ operatorId: id }),
  setDryRun: (value) => set({ dryRun: value }),
  setWatch: (value) => set({ watch: value }),
  ensureSession: async () => {
    const accountId = get().operatorId;
    try {
      const session = await ensureServerSession(accountId);
      if (get().operatorId !== accountId) {
        await get().ensureSession();
        return;
      }
      set({ serverMode: session.executionMode, dryRun: session.executionMode !== "real" });
    } catch {
      set({ serverMode: "dry-run" });
    }
  },

  pushNotice: (id) => {
    const state = get();
    if (!state.watch || state.notices.some((item) => item.id === id)) return;
    const alert = WATCH_ALERTS.find((item) => item.id === id);
    if (!alert) return;
    const notice: Notice = { ...alert, at: Date.now() };
    const user = operatorById(state.operatorId).name;
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
    const user = operatorById(state.operatorId).name;
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

  cancel: (turnId) => {
    const state = get();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn || turn.phase !== "awaiting") return;
    const next: Turn = { ...turn, phase: "cancelled", hint: "Заявка отменена. Ничего не менялось." };
    const user = operatorById(state.operatorId).name;
    set({
      turns: state.turns.map((item) => (item.id === turnId ? next : item)),
      audit: [auditFrom(next, user, "cancelled", null, turn.approval?.id ?? null), ...state.audit].slice(0, 80),
    });
  },

  reply: async (turnId, phrase) => {
    const text = phrase.trim();
    if (!text || lock) return;
    const turn = get().turns.find((item) => item.id === turnId);
    if (!turn || turn.phase !== "awaiting") return;
    lock = true;
    set({ busy: true });
    try {
      const result = await postCommand(text, uid("req"));
      const user = operatorById(get().operatorId).name;
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
    const pending = get().turns.find((item) => item.phase === "awaiting");
    if (pending) {
      if (/^отмена$/i.test(text) || /^cancel$/i.test(text)) {
        get().cancel(pending.id);
        return;
      }
      get().reply(pending.id, text);
      return;
    }
    lock = true;
    set({ busy: true });
    try {
      await get().ensureSession();
      const result = await postCommand(text, uid("req")).catch(() => null);
      const decision = result?.decision ?? unavailableDecision("Сервер политики не ответил.");
      const user = operatorById(get().operatorId).name;
      const id = uid("turn");
      const phase: Phase = result?.approval ? "awaiting" : decision.verdict === "deny" ? "denied" : "done";
      const next: Turn = {
        id,
        source,
        request: text,
        heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
        at: Date.now(),
        phase,
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
