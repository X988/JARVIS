import { randomUUID } from "node:crypto";
import { appendAudit, externalSinkLabel } from "../audit-log.ts";
import { createLockProvider } from "../locks.ts";
import { OPERATORS, evaluate, type Decision } from "../model.ts";
import { configProblems } from "./config.ts";
import { defaultRealExecute } from "./adapters.ts";
import { createApproval, findApproval, parameterHash, saveApproval } from "./approvals.ts";
import { rememberRequest } from "./idempotency.ts";
import { matchTarget, targetById, unknownLatinToken, type Target } from "./inventory.ts";
import { runbookById, runbookForIntent, type Runbook } from "./runbooks.ts";
import { evaluateRuntimePolicy, maintenanceWindowOpen } from "./policy.ts";
import type { Session } from "./session.ts";

export type Mode = "dry-run" | "mock" | "real";

export type ExecCall = {
  runbook: string;
  target: string;
  mode: Mode;
  /**
   * Server-derived parameters only. Client-supplied security fields are ignored
   * before this structure is built, and approved mutations bind these values
   * into the approval hash before Gateway is reached.
   */
  parameters?: Readonly<Record<string, string>>;
};

export type ExecResult = { called: boolean; code: string; detail: string };

export type ServerCapabilities = {
  elevated?: boolean;
  maintenanceWindow?: boolean;
};

export type Trace = {
  original: string;
  normalized: string;
  steps: string[];
  constraint: string;
  target: string;
  runbook: string;
  risk: number;
  policy: string;
  mode: Mode;
  execution: string;
  verification: string;
  audit: string;
};

export type PipelineResult = {
  code: string;
  verdict: "allow" | "deny" | "clarify";
  mode: Mode;
  executionCalled: boolean;
  auditId: string;
  requestId: string;
  duplicate?: boolean;
  trace: Trace;
  decision: Decision;
  approval: { id: string; phrase: string; expiresAt: number; stage: 1 | 2 } | null;
};

const SHORT_YES = /^(да|yes|ok|ага|подтверждаю)$/i;
const NO_CHANGE = /ничего не меняй|только скажи|только чтение|без изменений|только покажи/;
const DYNAMIC = /Выполнить\s*\(/i;

function normalizedParametersOf(decision: Decision): Record<string, string> {
  return Object.fromEntries(
    decision.parameters
      .map((item) => [item.key, item.value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function approvalHash(
  book: Runbook,
  target: string,
  decision: Decision,
  constraint: string,
): string {
  return parameterHash({
    runbook: book.id,
    target,
    normalized: decision.normalized,
    constraint,
    normalizedParameters: normalizedParametersOf(decision),
  });
}

function modeOf(explicit?: Mode): Mode {
  if (explicit) return explicit;
  const raw = process.env.EXECUTION_MODE;
  if (raw === "real" && configProblems().length > 0) return "dry-run";
  if (raw === "real" || raw === "mock" || raw === "dry-run") return raw;
  return "dry-run";
}

function denyShell(text: string, reason: string, risk: 0 | 1 | 2 | 3 = 3): Decision {
  const parsed = evaluate(text || "нет команды", OPERATORS[0], new Date());
  return {
    ...parsed,
    verdict: "deny",
    reason,
    risk,
    forceDeny: true,
    confirmation: "none",
    policyNotes: [reason, "Решение принято на сервере."],
  };
}

function finish(
  input: { text: string; requestId: string; session: Session | null; stateDir: string; now: Date },
  partial: Omit<PipelineResult, "auditId" | "requestId" | "trace"> & { trace: Omit<Trace, "audit"> },
): PipelineResult {
  const auditId = randomUUID();
  const row = appendAudit(
    {
      at: input.now.toISOString(),
      executionId: auditId,
      actor: input.session?.accountId ?? "anonymous",
      action: partial.trace.normalized,
      verdict: partial.verdict,
      sessionId: input.session?.id ?? "",
      commandId: input.requestId,
      normalized: partial.trace.normalized,
      target: partial.trace.target,
      runbook: partial.trace.runbook,
      risk: partial.trace.risk,
      policy: partial.trace.policy,
      approvalId: partial.approval?.id ?? "",
      executor: partial.executionCalled ? partial.trace.execution : "",
      result: partial.code,
      verification: partial.trace.verification,
      externalSink: externalSinkLabel(),
    },
    input.stateDir,
  );
  return {
    ...partial,
    auditId: row.hash ?? auditId,
    requestId: input.requestId,
    trace: { ...partial.trace, audit: row.hash ?? auditId },
  };
}

function gateway(
  runbook: Runbook,
  target: string,
  mode: Mode,
  stateDir: string,
  execute?: (call: ExecCall) => ExecResult,
  parameters: Readonly<Record<string, string>> = {},
): ExecResult {
  if (mode === "dry-run") return { called: false, code: "DRY_RUN", detail: "исполнитель не вызывался" };
  if (runbook.policy === "DENY_ALWAYS") return { called: false, code: "POLICY_DENIED", detail: "запрет не исполняется" };
  const lockKey = runbook.lock ? `${runbook.lock}:${target}` : "";
  const locks = createLockProvider(lockKey ? `${stateDir}/locks` : undefined);
  if (lockKey) {
    const held = locks.acquire(lockKey, "pipeline", 30 * 60 * 1000);
    if (!held.ok) {
      const code = held.reason === "held" ? "POLICY_DENIED" : "NOT_CONFIGURED";
      const detail = held.reason === "held" ? "уже выполняется такая операция" : `блокировка ${locks.id}: ${held.reason}`;
      return { called: false, code, detail };
    }
  }
  try {
    if (mode === "mock") return { called: true, code: "MOCK", detail: "mock, это не живой сервер" };
    const runner = execute ?? defaultRealExecute;
    return runner({ runbook: runbook.id, target, mode, parameters: { ...parameters } });
  } finally {
    if (lockKey) locks.release(lockKey);
  }
}

export function processCommand(input: {
  text: string;
  requestId: string;
  session: Session | null;
  now?: Date;
  stateDir: string;
  mode?: Mode;
  execute?: (call: ExecCall) => ExecResult;
  forged?: Record<string, unknown>;
  approval?: { id: string; confirmation: string };
  capabilities?: ServerCapabilities;
}): PipelineResult {
  const now = input.now ?? new Date();
  const mode = modeOf(input.mode);
  const requestId = input.requestId || randomUUID();
  const actorKey = `${input.session?.accountId ?? "anonymous"}:${requestId}`;
  const stored = rememberRequest(input.stateDir, actorKey, () => runOnce({ ...input, requestId, now, mode }));
  if (stored.duplicate) return { ...stored.value, duplicate: true };
  return stored.value;

  function runOnce(current: typeof input & { now: Date; mode: Mode; requestId: string }): PipelineResult {
    void current.forged;
    const text = current.text.trim();
    const base = {
      text,
      requestId: current.requestId,
      session: current.session,
      stateDir: current.stateDir,
      now: current.now,
    };
    if (!current.session) {
      return finish(base, {
        code: "AUTH_REQUIRED",
        verdict: "deny",
        mode: current.mode,
        executionCalled: false,
        decision: denyShell(text, "Нет серверной сессии."),
        approval: null,
        trace: emptyTrace(text, current.mode, "нет сессии"),
      });
    }
    if (current.session.role !== "operator") {
      return finish(base, {
        code: "ACTOR_DENIED",
        verdict: "deny",
        mode: current.mode,
        executionCalled: false,
        decision: denyShell(text, "Эта учётка не оператор."),
        approval: null,
        trace: emptyTrace(text, current.mode, "учётка без прав"),
      });
    }
    if (current.approval) return confirmApproval(base, current, current.approval.id, current.approval.confirmation);
    if (SHORT_YES.test(text)) {
      return finish(base, {
        code: "POLICY_DENIED",
        verdict: "deny",
        mode: current.mode,
        executionCalled: false,
        decision: denyShell(text, "Короткое согласие не подтверждение. Нужна фраза CONFIRM и номер заявки."),
        approval: null,
        trace: emptyTrace(text, current.mode, "короткое согласие"),
      });
    }
    return fresh(base, current);
  }
}

function emptyTrace(original: string, mode: Mode, normalized: string): Omit<Trace, "audit"> {
  return {
    original,
    normalized,
    steps: ["authenticate"],
    constraint: "нет",
    target: "—",
    runbook: "—",
    risk: 3,
    policy: "DENY",
    mode,
    execution: "не вызывался",
    verification: "нет",
  };
}

function confirmApproval(
  base: { text: string; requestId: string; session: Session | null; stateDir: string; now: Date },
  current: {
    mode: Mode;
    stateDir: string;
    now: Date;
    session: Session | null;
    execute?: (call: ExecCall) => ExecResult;
    approval?: { id: string; confirmation: string };
    capabilities?: ServerCapabilities;
  },
  approvalId: string,
  confirmation: string,
): PipelineResult {
  const row = findApproval(current.stateDir, approvalId);
  if (!row || !current.session) {
    return finish(base, {
      code: "APPROVAL_MISMATCH", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Такой заявки нет или она не принадлежит текущей сессии."), approval: null,
      trace: emptyTrace(base.text, current.mode, "approval"),
    });
  }
  if (row.actorId !== current.session.accountId) {
    return finish(base, {
      code: "ACTOR_DENIED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Заявка принадлежит другому actor."), approval: null,
      trace: emptyTrace(base.text, current.mode, row.normalized),
    });
  }
  if (row.status !== "pending") {
    return finish(base, {
      code: row.status === "expired" ? "APPROVAL_EXPIRED" : "APPROVAL_MISMATCH", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Заявка уже недействительна."), approval: null,
      trace: { ...emptyTrace(base.text, current.mode, row.normalized), runbook: row.runbook, target: row.target, risk: row.risk as 0 | 1 | 2 | 3 },
    });
  }
  if (row.expiresAt <= current.now.getTime()) {
    saveApproval(current.stateDir, { ...row, status: "expired" });
    return finish(base, {
      code: "APPROVAL_EXPIRED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Срок подтверждения истёк."), approval: null,
      trace: { ...emptyTrace(base.text, current.mode, row.normalized), runbook: row.runbook, target: row.target, risk: row.risk as 0 | 1 | 2 | 3 },
    });
  }

  const expected = row.required === 2 && row.stage === 2 ? "CONFIRM FINAL " + row.id : "CONFIRM " + row.id;
  if (SHORT_YES.test(confirmation.trim()) || confirmation.trim() !== expected) {
    return finish(base, {
      code: "APPROVAL_MISMATCH", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Нужна точная серверная фраза подтверждения."),
      approval: { id: row.id, phrase: expected, expiresAt: row.expiresAt, stage: row.stage },
      trace: { ...emptyTrace(base.text, current.mode, row.normalized), runbook: row.runbook, target: row.target, risk: row.risk as 0 | 1 | 2 | 3 },
    });
  }

  const parsed = evaluate(base.text, OPERATORS[0], current.now);
  const book = runbookForIntent(parsed.normalized) ?? inferRunbook(base.text);
  const hinted = matchTarget(base.text) ?? (parsed.target === "fleet" ? targetById("fleet") : targetById(parsed.target));
  const constraint = NO_CHANGE.test(base.text.toLowerCase()) ? "NO_CHANGE" : "нет";
  const hash = book && hinted ? approvalHash(book, hinted.id, parsed, constraint) : "";
  if (!book || !hinted || hash !== row.parameterHash || book.risk !== row.risk) {
    saveApproval(current.stateDir, { ...row, status: "mismatch" });
    return finish(base, {
      code: "APPROVAL_MISMATCH", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Команда или её параметры изменились. Требуется новая заявка."), approval: null,
      trace: { ...emptyTrace(base.text, current.mode, parsed.normalized), runbook: book?.id ?? "—", target: hinted?.id ?? "—", risk: book?.risk ?? 3 },
    });
  }

  if (book.policy === "DENY_ALWAYS") {
    return finish(base, {
      code: "POLICY_DENIED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "DENY_ALWAYS нельзя отменить заявкой."), approval: null,
      trace: { ...emptyTrace(base.text, current.mode, parsed.normalized), runbook: book.id, target: hinted.id, risk: book.risk, policy: "DENY_ALWAYS" },
    });
  }

  const confirmedPolicy = evaluateRuntimePolicy(book.policy, {
    mode: current.mode,
    elevated: current.capabilities?.elevated ?? false,
    maintenanceWindow: current.capabilities?.maintenanceWindow ?? maintenanceWindowOpen(current.now),
  });
  if (confirmedPolicy.code === "DENY") {
    return finish(base, {
      code: "POLICY_DENIED",
      verdict: "deny",
      mode: current.mode,
      executionCalled: false,
      decision: denyShell(base.text, confirmedPolicy.reason, book.risk),
      approval: null,
      trace: { ...emptyTrace(base.text, current.mode, parsed.normalized), runbook: book.id, target: hinted.id, risk: book.risk, policy: book.policy },
    });
  }

  if (row.required === 2 && row.stage === 1) {
    const next = { ...row, stage: 2 as const };
    saveApproval(current.stateDir, next);
    return finish(base, {
      code: "APPROVAL_REQUIRED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Требуется второй серверный этап подтверждения.", book.risk),
      approval: { id: next.id, phrase: "CONFIRM FINAL " + next.id, expiresAt: next.expiresAt, stage: 2 },
      trace: traceOf(base.text, parsed.normalized, "нет", hinted.id, book, current.mode, "не вызывался", "ждёт второе подтверждение"),
    });
  }

  saveApproval(current.stateDir, { ...row, status: "confirmed" });
  const exec = gateway(
    book,
    hinted.id,
    current.mode,
    current.stateDir,
    current.execute,
    normalizedParametersOf(parsed),
  );
  const ok = exec.code === "DRY_RUN" || exec.code === "MOCK" || exec.code === "OK";
  const decision: Decision = {
    ...parsed, verdict: ok ? "allow" : "deny", reason: ok ? null : exec.detail, risk: book.risk, runbook: book.id, target: hinted.id, forceDeny: !ok,
    policyNotes: ["Решение принято на сервере.", "Режим " + current.mode + ".", exec.detail],
  };
  return finish(base, {
    code: ok ? "OK" : exec.code === "NOT_CONFIGURED" ? "EXECUTION_DISABLED" : exec.code,
    verdict: decision.verdict, mode: current.mode, executionCalled: exec.called, decision, approval: null,
    trace: traceOf(base.text, parsed.normalized, "нет", hinted.id, book, current.mode, exec.detail, exec.code === "OK" ? book.verification : "проверка не выполнялась"),
  });
}

function inferRunbook(text: string): Runbook | null {
  const source = text.toLowerCase();
  if (/резервн|бэкап|backup/.test(source)) return runbookById("sql.backup");
  if (/удали базу|drop database/.test(source)) return runbookById("database.drop");
  if (/пуш|push/.test(source) && /main|master/.test(source)) return runbookById("git.push");
  return null;
}

function fresh(
  base: { text: string; requestId: string; session: Session | null; stateDir: string; now: Date },
  current: {
    text: string;
    mode: Mode;
    stateDir: string;
    now: Date;
    session: Session | null;
    execute?: (call: ExecCall) => ExecResult;
    capabilities?: ServerCapabilities;
  },
): PipelineResult {
  const text = current.text.trim();
  if (DYNAMIC.test(text)) return denied(base, current.mode, "onec.exec", "DENY_ALWAYS", 3, "POLICY_DENIED", "Выполнить() запрещён.");
  const parsed = evaluate(text, OPERATORS[0], current.now);
  const constraint = NO_CHANGE.test(text.toLowerCase()) ? "NO_CHANGE" : "нет";
  const book = runbookForIntent(parsed.normalized) ?? inferRunbook(text);
  if (!book) {
    return denied(base, current.mode, "—", "DENY", 3, "RUNBOOK_NOT_FOUND", "Такого runbook нет. Новый я не придумываю.", parsed.normalized, constraint);
  }
  if (book.policy === "DENY_ALWAYS" || parsed.forceDeny) {
    return denied(base, current.mode, book.id, "DENY_ALWAYS", book.risk, "POLICY_DENIED", parsed.denyReason ?? "Запрещено всегда. Заявка это не отменяет.", parsed.normalized, constraint, book.risk);
  }
  const hinted = matchTarget(text) ?? (parsed.target === "inventory" || parsed.target === "все серверы" ? targetById("fleet") : targetById(parsed.target));
  const stray = unknownLatinToken(text);
  if (stray) {
    return denied(base, current.mode, book.id, book.policy, book.risk, "TARGET_NOT_FOUND", `Цели «${stray}» нет в inventory.`, parsed.normalized, constraint);
  }
  const target: Target | null = hinted;
  if (!target || (book.targets.length > 0 && !book.targets.includes(target.id))) {
    return denied(base, current.mode, book.id, book.policy, book.risk, "TARGET_NOT_FOUND", "Цель не найдена в inventory.", parsed.normalized, constraint);
  }
  if (!target.allowedRunbooks.includes(book.id)) {
    return denied(base, current.mode, book.id, book.policy, book.risk, "POLICY_DENIED", "На эту цель такой runbook не разрешён.", parsed.normalized, constraint);
  }
  if (constraint === "NO_CHANGE" && book.mutates) {
    return denied(base, current.mode, book.id, "DENY", book.risk, "POLICY_DENIED", "Стоит ограничение «ничего не менять». Изменение выкинуто.", parsed.normalized, constraint);
  }

  const runtimePolicy = evaluateRuntimePolicy(book.policy, {
    mode: current.mode,
    elevated: current.capabilities?.elevated ?? false,
    maintenanceWindow: current.capabilities?.maintenanceWindow ?? maintenanceWindowOpen(current.now),
  });
  if (runtimePolicy.code === "DENY") {
    return denied(
      base,
      current.mode,
      book.id,
      book.policy,
      book.risk,
      "POLICY_DENIED",
      runtimePolicy.reason,
      parsed.normalized,
      constraint,
      book.risk,
    );
  }

  if (runtimePolicy.code === "APPROVAL_REQUIRED") {
    const stamp = current.now.toISOString().slice(0, 10).replace(/-/g, "");
    const id = `APPROVAL-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const record = createApproval(current.stateDir, {
      id,
      actorId: current.session?.accountId ?? "",
      runbook: book.id,
      target: target.id,
      normalized: parsed.normalized,
      normalizedParameters: normalizedParametersOf(parsed),
      constraint,
      parameterHash: approvalHash(book, target.id, parsed, constraint),
      risk: book.risk,
      createdAt: current.now.getTime(),
      expiresAt: current.now.getTime() + 5 * 60 * 1000,
      required: book.approval === "double" ? 2 : 1,
    });
    const decision = denyShell(text, `Нужна фраза CONFIRM ${record.id}.`, book.risk);
    decision.confirmation = book.approval === "double" ? "double" : "single";
    decision.runbook = book.id;
    decision.target = target.id;
    return finish(base, {
      code: "APPROVAL_REQUIRED",
      verdict: "deny",
      mode: current.mode,
      executionCalled: false,
      decision,
      approval: { id: record.id, phrase: `CONFIRM ${record.id}`, expiresAt: record.expiresAt, stage: 1 },
      trace: traceOf(text, parsed.normalized, constraint, target.id, book, current.mode, "заявка, исполнитель не вызывался", "ждёт заявку"),
    });
  }
  const exec = gateway(
    book,
    target.id,
    current.mode,
    current.stateDir,
    current.execute,
    normalizedParametersOf(parsed),
  );
  const ok = exec.code === "DRY_RUN" || exec.code === "MOCK" || exec.code === "OK";
  const decision: Decision = {
    ...parsed,
    verdict: ok ? "allow" : "deny",
    reason: ok ? null : exec.detail,
    risk: book.risk,
    runbook: book.id,
    target: target.id,
    forceDeny: !ok,
    policyNotes: ["Решение принято на сервере.", `Режим ${current.mode}.`, exec.detail],
  };
  return finish(base, {
    code: ok ? "OK" : exec.code === "NOT_CONFIGURED" ? "EXECUTION_DISABLED" : exec.code,
    verdict: decision.verdict,
    mode: current.mode,
    executionCalled: exec.called,
    decision,
    approval: null,
    trace: traceOf(text, parsed.normalized, constraint, target.id, book, current.mode, exec.detail, ok ? "прогона не было" : "проверки нет"),
  });
}

function denied(
  base: { text: string; requestId: string; session: Session | null; stateDir: string; now: Date },
  mode: Mode,
  runbook: string,
  policy: string,
  risk: number,
  code: string,
  reason: string,
  normalized = "denied",
  constraint = "нет",
  bookRisk?: number,
): PipelineResult {
  const decision = denyShell(base.text, reason, (bookRisk ?? risk) as 0 | 1 | 2 | 3);
  decision.runbook = runbook === "—" ? null : runbook;
  return finish(base, {
    code,
    verdict: "deny",
    mode,
    executionCalled: false,
    decision,
    approval: null,
    trace: {
      ...emptyTrace(base.text, mode, normalized),
      constraint,
      runbook,
      risk,
      policy,
      steps: ["authenticate", "parse", "policy", "audit"],
    },
  });
}

function traceOf(original: string, normalized: string, constraint: string, target: string, book: Runbook, mode: Mode, execution: string, verification: string): Omit<Trace, "audit"> {
  return {
    original,
    normalized,
    steps: ["authenticate", "normalize", "parse", "alias", "constraint", "inventory", "runbook", "policy", "risk", "approval", "gateway", "verify", "audit"],
    constraint,
    target,
    runbook: book.id,
    risk: book.risk,
    policy: book.policy,
    mode,
    execution,
    verification,
  };
}

export class CommandService {
  process(input: Parameters<typeof processCommand>[0]): PipelineResult {
    return processCommand(input);
  }
}
