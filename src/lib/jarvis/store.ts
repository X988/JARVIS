import { create } from "zustand";
import {
  APPROVAL_TTL_MS,
  OPERATORS,
  evaluate,
  type Decision,
  type Operator,
} from "@/lib/jarvis/model";
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
  pushNotice: (id: string) => void;
  submit: (raw: string, source: "text" | "voice", heard?: string) => Promise<void>;
  reply: (turnId: string, phrase: string) => void;
  cancel: (turnId: string) => void;
  tick: (ts: number) => void;
};

let n = 0;
function uid(prefix: string): string {
  n += 1;
  return `${prefix}-${n}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function operatorById(id: string): Operator {
  return OPERATORS.find((item) => item.id === id) ?? OPERATORS[0];
}

function dayStamp(date: Date): string {
  const p = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
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
      source: "watch",
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

  reply: (turnId, phrase) => {
    const text = phrase.trim();
    if (!text) return;
    const state = get();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn || turn.phase !== "awaiting" || !turn.approval) return;
    const user = operatorById(state.operatorId).name;
    const replies = [...turn.replies, text];
    if (/^(да|ок|ok|yes|подтверждаю|confirm)$/i.test(text)) {
      const next = { ...turn, replies, hint: "Короткое «да» без номера заявки не принимаю." };
      set({ turns: state.turns.map((item) => (item.id === turnId ? next : item)) });
      return;
    }
    if (text !== turn.approval.phrase) {
      const next = { ...turn, replies, hint: "Фраза не совпала с заявкой. Скопируйте её целиком." };
      set({ turns: state.turns.map((item) => (item.id === turnId ? next : item)) });
      return;
    }
    if (Date.now() > turn.approval.expiresAt) {
      const next: Turn = { ...turn, replies, phase: "expired", hint: "Срок заявки истёк." };
      set({
        turns: state.turns.map((item) => (item.id === turnId ? next : item)),
        audit: [auditFrom(next, user, "expired", "approval ttl", turn.approval.id), ...state.audit].slice(0, 80),
      });
      return;
    }
    if (turn.decision.confirmation === "double" && turn.approval.stage === 1) {
      const phraseNext = `CONFIRM-FINAL ${turn.approval.id}`;
      const next: Turn = {
        ...turn,
        replies,
        hint: "Первый этап принят. Нужна вторая фраза той же заявки.",
        approval: { ...turn.approval, stage: 2, phrase: phraseNext },
      };
      set({
        turns: state.turns.map((item) => (item.id === turnId ? next : item)),
        audit: [auditFrom(next, user, "approval_stage_1", null, turn.approval.id), ...state.audit].slice(0, 80),
      });
      return;
    }
    const ticket = turn.decision.normalized === "provision_1c_admin";
    const next: Turn = {
      ...turn,
      replies,
      phase: "done",
      step: 4,
      executed: !ticket,
      showFindings: true,
      hint: ticket ? "Заявка закрыта. Учётка в каталоге не появилась." : null,
      exitCode: 0,
      durationMs: turn.decision.durationMs,
    };
    set({
      turns: state.turns.map((item) => (item.id === turnId ? next : item)),
      audit: [auditFrom(next, user, ticket ? "ticket_only" : "simulated_ok", null, turn.approval.id), ...state.audit].slice(0, 80),
    });
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
      const state = get();
      const operator = operatorById(state.operatorId);
      const decision = evaluate(text, operator, new Date());
      const dryRun = state.dryRun;
      const id = uid("turn");
      const base: Turn = {
        id,
        source,
        request: text,
        heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
        at: Date.now(),
        phase: "running",
        step: 1,
        decision,
        approval: null,
        executed: false,
        showFindings: false,
        dryRun,
        exitCode: null,
        durationMs: null,
        hint: null,
        replies: [],
      };
      set({ turns: [...state.turns, base] });
      for (let step = 2; step <= 4; step += 1) {
        await sleep(280);
        set({
          turns: get().turns.map((item) => (item.id === id ? { ...item, step } : item)),
        });
      }
      const user = operator.name;
      const readSnapshot = decision.verdict === "allow" && !decision.mutation;
      const ticket = decision.normalized === "provision_1c_admin";
      const needsApproval = decision.verdict === "allow" && decision.confirmation !== "none" && (!dryRun || ticket);
      const executeNow = decision.verdict === "allow" && !dryRun && decision.confirmation === "none";
      if (needsApproval) {
        const seq = get().seq + 1;
        const approvalId = `APPROVAL-${dayStamp(new Date())}-${String(seq).padStart(4, "0")}`;
        const approval: Approval = {
          id: approvalId,
          stage: 1,
          expiresAt: Date.now() + APPROVAL_TTL_MS,
          phrase: `CONFIRM ${approvalId}`,
        };
        const next: Turn = {
          ...base,
          step: 4,
          phase: "awaiting",
          approval,
          dryRun,
          showFindings: decision.previewFindings,
          exitCode: decision.previewFindings ? 0 : null,
          durationMs: decision.previewFindings ? decision.durationMs : null,
        };
        set({
          seq,
          turns: get().turns.map((item) => (item.id === id ? next : item)),
          audit: [auditFrom(next, user, "awaiting_approval", null, approvalId), ...get().audit].slice(0, 80),
        });
        return;
      }
      const preview = decision.previewFindings && decision.verdict === "allow" && decision.findings.length > 0;
      const showFindings = readSnapshot || executeNow || preview;
      let result = "dry_run";
      if (decision.verdict === "deny") result = "denied";
      else if (decision.verdict === "clarify") result = "clarify";
      else if (executeNow) result = "simulated_ok";
      else if (readSnapshot) result = dryRun ? "read_dry_run" : "simulated_ok";
      const next: Turn = {
        ...base,
        step: 4,
        phase: decision.verdict === "deny" ? "denied" : "done",
        executed: executeNow,
        showFindings,
        dryRun,
        exitCode: showFindings ? 0 : null,
        durationMs: showFindings ? decision.durationMs : null,
      };
      set({
        turns: get().turns.map((item) => (item.id === id ? next : item)),
        audit: [
          auditFrom(next, user, result, decision.verdict === "allow" ? null : decision.reason, null),
          ...get().audit,
        ].slice(0, 80),
      });
    } finally {
      lock = false;
      set({ busy: false });
    }
  },
}));
