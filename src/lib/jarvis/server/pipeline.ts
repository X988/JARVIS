import { randomUUID } from "node:crypto";
import { increment, observeDuration } from "../metrics.ts";
import { appendAudit, externalSinkLabel, recordAuditIntegrityAlert, verifyAudit } from "../audit-log.ts";
import { createLockProvider } from "../locks.ts";
import { OPERATORS, evaluate, type Decision } from "../model.ts";
import { defaultRealExecute } from "./adapters.ts";
import { attachApprovalAudit, createApproval, parameterHash, settleApproval, takeApproval } from "./approvals.ts";
import { rememberRequest } from "./idempotency.ts";
import { matchTarget, targetById, unknownLatinToken, type Target } from "./inventory.ts";
import { runbookById, runbookForIntent, type Runbook } from "./runbooks.ts";
import { evaluateRuntimePolicy, maintenanceWindowOpen } from "./policy.ts";
import { canExecute, canRead, sessionUsable, type Session } from "./session.ts";
import { modeOf as sharedModeOf } from "./mode";

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
  /** Set server-side by the channel wrapper (e.g. voice); used for audit labels only. */
  channel?: string;
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
  return sharedModeOf(explicit);
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
  input: {
    text: string;
    requestId: string;
    session: Session | null;
    stateDir: string;
    now: Date;
    channel?: Session["channel"];
  },
  partial: Omit<PipelineResult, "auditId" | "requestId" | "trace"> & { trace: Omit<Trace, "audit"> },
): PipelineResult {
  const auditId = randomUUID();
  const channel = input.channel ?? input.session?.channel ?? "web";
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
      channel,
      tool: partial.trace.runbook,
      error: partial.verdict === "deny" ? partial.code : "",
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
    const lockStarted = Date.now();
    const held = locks.acquire(lockKey, "pipeline", 30 * 60 * 1000);
    observeDuration("jarvis_lock_wait_seconds", (Date.now() - lockStarted) / 1000);
    if (!held.ok) {
      const code = held.reason === "held" ? "POLICY_DENIED" : "NOT_CONFIGURED";
      const detail = held.reason === "held" ? "уже выполняется такая операция" : `блокировка ${locks.id}: ${held.reason}`;
      return { called: false, code, detail };
    }
  }
  try {
    increment("jarvis_executor_calls_total");
    const started = Date.now();
    const result =
      mode === "mock"
        ? { called: true, code: "MOCK", detail: "mock, это не живой сервер" }
        : (execute ?? defaultRealExecute)({
            runbook: runbook.id,
            target,
            mode,
            parameters: { ...parameters },
          });
    observeDuration("jarvis_executor_duration_seconds", (Date.now() - started) / 1000);
    if (result.code !== "OK" && result.code !== "MOCK") {
      increment("jarvis_executor_failures_total");
    }
    return result;
  } finally {
    if (lockKey) locks.release(lockKey);
  }
}

function safeGateway(
  runbook: Runbook,
  target: string,
  mode: Mode,
  stateDir: string,
  execute?: (call: ExecCall) => ExecResult,
  parameters: Readonly<Record<string, string>> = {},
): ExecResult {
  try {
    const result = gateway(runbook, target, mode, stateDir, execute, parameters);
    return {
      called: result.called,
      code: result.code || "EXECUTION_FAILED",
      detail: (result.detail || "пустой ответ исполнителя").slice(0, 4_000),
    };
  } catch {
    return { called: false, code: "EXECUTION_FAILED", detail: "исполнитель завершился ошибкой и не считается успехом" };
  }
}

function rememberAudit(stateDir: string, approvalId: string | undefined, auditId: string): void {
  if (!approvalId) return;
  try {
    attachApprovalAudit(stateDir, approvalId, auditId);
  } catch {
    // The hash-chain row is already durable. A link failure must not turn a denial into success.
  }
}


export type RegisteredToolResult = {
  code: string;
  verdict: "allow" | "deny";
  mode: Mode;
  requestId: string;
  auditId: string;
  runbook: string;
  target: string;
  executionCalled: boolean;
  detail: string;
  verification: string;
};

function refuseBrokenAudit(
  stateDir: string,
  now: Date,
  session: Session | null,
  requestId: string,
): string | null {
  let integrity: ReturnType<typeof verifyAudit>;
  try {
    integrity = verifyAudit(stateDir);
  } catch {
    integrity = { ok: false, rows: 0, reason: "invalid-json" };
  }
  if (integrity.ok) return null;
  try {
    recordAuditIntegrityAlert(stateDir, {
      at: now.toISOString(),
      requestId,
      actor: session?.accountId ?? "anonymous",
      rows: integrity.rows,
      reason: integrity.reason,
    });
  } catch {
    // The refusal stands even when the side alert cannot be written.
  }
  return "Журнал аудита повреждён. Исполнение остановлено, новая запись в цепочку не добавлялась.";
}

export function processRegisteredReadOnlyTool(input: {
  runbook: string;
  target: string;
  requestId: string;
  session: Session | null;
  stateDir: string;
  now?: Date;
  mode?: Mode;
  execute?: (call: ExecCall) => ExecResult;
  capabilities?: ServerCapabilities;
  channel?: Session["channel"];
}): RegisteredToolResult {
  const now = input.now ?? new Date();
  const mode = modeOf(input.mode);
  const requestId = input.requestId || randomUUID();
  const blocked = refuseBrokenAudit(input.stateDir, now, input.session, requestId);
  if (blocked) {
    return {
      code: "AUDIT_INTEGRITY",
      verdict: "deny",
      mode,
      requestId,
      auditId: "",
      runbook: input.runbook,
      target: input.target,
      executionCalled: false,
      detail: blocked,
      verification: "не выполнялась",
    };
  }

  function finishRegistered(
    code: string,
    verdict: "allow" | "deny",
    detail: string,
    book: Runbook | null,
    targetId: string,
    executionCalled = false,
  ): RegisteredToolResult {
    const auditId = randomUUID();
    const row = appendAudit(
      {
        at: now.toISOString(),
        executionId: auditId,
        actor: input.session?.accountId ?? "anonymous",
        action: book ? `agent-tool:${book.id}` : "agent-tool:rejected",
        verdict,
        sessionId: input.session?.id ?? "",
        commandId: requestId,
        normalized: book?.id ?? input.runbook,
        target: targetId,
        runbook: book?.id ?? input.runbook,
        risk: book?.risk ?? 3,
        policy: book?.policy ?? "DENY",
        approvalId: "",
        executor: executionCalled ? book?.executor ?? "" : "",
        result: code,
        verification: book?.verification ?? "not executed",
        externalSink: externalSinkLabel(),
        channel: input.channel ?? input.session?.channel ?? "agent",
        tool: book?.id ?? input.runbook,
        error: verdict === "deny" ? code : "",
      },
      input.stateDir,
    );
    return {
      code,
      verdict,
      mode,
      requestId,
      auditId: row.hash ?? auditId,
      runbook: book?.id ?? input.runbook,
      target: targetId,
      executionCalled,
      detail,
      verification: book?.verification ?? "not executed",
    };
  }

  if (!sessionUsable(input.session, now.getTime())) {
    return finishRegistered(
      input.session ? "AUTH_REQUIRED" : "AUTH_REQUIRED",
      "deny",
      input.session ? "Сессия истекла." : "Нет серверной сессии.",
      null,
      input.target,
    );
  }
  if (!canRead(input.session.role)) {
    return finishRegistered("ACTOR_DENIED", "deny", "Эта учётка не допущена.", null, input.target);
  }

  const book = runbookById(input.runbook);
  if (!book) {
    return finishRegistered("RUNBOOK_NOT_FOUND", "deny", "Runbook отсутствует в registry.", null, input.target);
  }
  const target = targetById(input.target);
  if (!target) {
    return finishRegistered("TARGET_NOT_FOUND", "deny", "Target отсутствует в inventory.", book, input.target);
  }
  if (book.targets.length > 0 && !book.targets.includes(target.id)) {
    return finishRegistered("POLICY_DENIED", "deny", "Runbook не разрешён для этого target.", book, target.id);
  }
  if (!target.allowedRunbooks.includes(book.id)) {
    return finishRegistered("POLICY_DENIED", "deny", "Inventory не разрешает этот runbook.", book, target.id);
  }

  // Autonomous AI execution is intentionally read-only. Mutations continue
  // through processCommand/Approval Engine and can never be enabled by model output.
  if (!canExecute(input.session.role) && book.mutates) {
    return finishRegistered("ACTOR_DENIED", "deny", "Этой роли нельзя менять инфраструктуру.", book, target.id);
  }
  if (book.mutates || book.risk !== 0 || book.approval !== "none") {
    return finishRegistered(
      "MUTATION_REQUIRES_APPROVAL",
      "deny",
      "AI loop не исполняет изменения автономно; требуется обычный approval-контур.",
      book,
      target.id,
    );
  }

  const policy = evaluateRuntimePolicy(book.policy, {
    mode,
    elevated: input.capabilities?.elevated,
    maintenanceWindow: input.capabilities?.maintenanceWindow ?? maintenanceWindowOpen(now),
  });
  if (policy.code !== "ALLOW") {
    return finishRegistered(
      policy.code === "APPROVAL_REQUIRED" ? "MUTATION_REQUIRES_APPROVAL" : "POLICY_DENIED",
      "deny",
      policy.code === "DENY" ? policy.reason : "Policy требует approval.",
      book,
      target.id,
    );
  }

  const result = safeGateway(book, target.id, mode, input.stateDir, input.execute);
  const allowed = result.code === "OK" || result.code === "MOCK" || result.code === "DRY_RUN";
  return finishRegistered(
    result.code,
    allowed ? "allow" : "deny",
    result.detail,
    book,
    target.id,
    result.called,
  );
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
  approval?: { id: string; confirmation: string; decision?: "confirm" | "reject" };
  capabilities?: ServerCapabilities;
  channel?: Session["channel"];
}): PipelineResult {
  const startedAt = Date.now();
  increment("jarvis_commands_total");
  const now = input.now ?? new Date();
  const mode = modeOf(input.mode);
  const requestId = input.requestId || randomUUID();
  const actorId = input.session?.accountId ?? "anonymous";
  try {
    const blocked = refuseBrokenAudit(input.stateDir, now, input.session, requestId);
    if (blocked) {
      increment("jarvis_commands_denied_total");
      return {
        code: "AUDIT_INTEGRITY",
        verdict: "deny",
        mode,
        executionCalled: false,
        auditId: "",
        requestId,
        trace: { ...emptyTrace(input.text.trim(), mode, "целостность аудита"), audit: "BROKEN", steps: ["audit-integrity"] },
        decision: denyShell(input.text.trim(), blocked),
        approval: null,
      };
    }
    const stored = rememberRequest(
      input.stateDir,
      actorId,
      requestId,
      () => runOnce({ ...input, requestId, now, mode }),
    );
    if (stored.duplicate) increment("jarvis_idempotency_duplicates_total");
    const result = stored.duplicate ? { ...stored.value, duplicate: true } : stored.value;

    if (result.verdict === "allow") increment("jarvis_commands_allowed_total");
    else if (result.verdict === "deny") increment("jarvis_commands_denied_total");

    if (
      ["EXECUTION_DISABLED", "EXECUTION_TIMEOUT", "VERIFICATION_FAILED", "CONNECT_FAILED"].includes(
        result.code,
      )
    ) {
      increment("jarvis_commands_failed_total");
    }

    if (result.code === "APPROVAL_REQUIRED") increment("jarvis_approval_requested_total");
    if (result.code === "APPROVAL_EXPIRED") increment("jarvis_approval_expired_total");
    if (input.approval && result.code === "OK") increment("jarvis_approval_approved_total");
    if (
      input.approval &&
      result.verdict === "deny" &&
      result.code !== "APPROVAL_EXPIRED" &&
      result.code !== "APPROVAL_REQUIRED"
    ) {
      increment("jarvis_approval_denied_total");
    }
    return result;
  } catch (error) {
    increment("jarvis_commands_failed_total");
    throw error;
  } finally {
    observeDuration("jarvis_command_duration_seconds", (Date.now() - startedAt) / 1000);
  }

  function runOnce(current: typeof input & { now: Date; mode: Mode; requestId: string }): PipelineResult {
    void current.forged;
    const text = current.text.trim();
    const base = {
      text,
      requestId: current.requestId,
      session: current.session,
      stateDir: current.stateDir,
      now: current.now,
      channel: current.channel,
    };
    if (!sessionUsable(current.session, current.now.getTime())) {
      return finish(base, {
        code: "AUTH_REQUIRED",
        verdict: "deny",
        mode: current.mode,
        executionCalled: false,
        decision: denyShell(text, current.session ? "Сессия истекла." : "Нет серверной сессии."),
        approval: null,
        trace: emptyTrace(text, current.mode, "нет сессии"),
      });
    }
    if (!canRead(current.session.role)) {
      return finish(base, {
        code: "ACTOR_DENIED",
        verdict: "deny",
        mode: current.mode,
        executionCalled: false,
        decision: denyShell(text, "Эта учётка не допущена."),
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
  base: { text: string; requestId: string; session: Session | null; stateDir: string; now: Date; channel?: Session["channel"] },
  current: {
    mode: Mode;
    stateDir: string;
    now: Date;
    session: Session | null;
    execute?: (call: ExecCall) => ExecResult;
    approval?: { id: string; confirmation: string; decision?: "confirm" | "reject" };
    capabilities?: ServerCapabilities;
  },
  approvalId: string,
  confirmation: string,
): PipelineResult {
  if (!current.session || !canExecute(current.session.role)) {
    return finish(base, {
      code: "ACTOR_DENIED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Подтверждать может только admin или operator."), approval: null,
      trace: emptyTrace(base.text, current.mode, "approval"),
    });
  }
  const parsed = evaluate(base.text, OPERATORS[0], current.now);
  const book = runbookForIntent(parsed.normalized) ?? inferRunbook(base.text);
  const hinted = matchTarget(base.text) ?? (parsed.target === "fleet" ? targetById("fleet") : targetById(parsed.target));
  const constraint = NO_CHANGE.test(base.text.toLowerCase()) ? "NO_CHANGE" : "нет";
  const hash = book && hinted ? approvalHash(book, hinted.id, parsed, constraint) : "";
  const runtime = book
    ? evaluateRuntimePolicy(book.policy, {
        mode: current.mode,
        elevated: current.capabilities?.elevated ?? false,
        maintenanceWindow: current.capabilities?.maintenanceWindow ?? maintenanceWindowOpen(current.now),
      })
    : { code: "DENY" as const, reason: "Runbook отсутствует." };
  const taken = takeApproval(current.stateDir, {
    id: approvalId,
    actorId: current.session.accountId,
    now: current.now.getTime(),
    decision: current.approval?.decision === "reject" ? "reject" : "confirm",
    phrase: confirmation,
    expectedHash: hash,
    risk: book?.risk ?? -1,
    policyDeny: !book || book.policy === "DENY_ALWAYS" || runtime.code === "DENY",
  });

  if (taken.action === "missing") {
    return finish(base, {
      code: "APPROVAL_MISMATCH", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Такой заявки нет."), approval: null,
      trace: emptyTrace(base.text, current.mode, "approval"),
    });
  }
  if (taken.action === "rejected") {
    const done = finish(base, {
      code: "APPROVAL_REJECTED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Заявка отклонена. Исполнитель не вызывался."), approval: null,
      trace: { ...emptyTrace(base.text, current.mode, taken.row.normalized), runbook: taken.row.runbook, target: taken.row.target, risk: taken.row.risk as 0 | 1 | 2 | 3 },
    });
    rememberAudit(current.stateDir, taken.row.id, done.auditId);
    return done;
  }
  if (taken.action === "deny") {
    const phrase = taken.row && taken.row.status === "pending"
      ? (taken.row.required === 2 && taken.row.stage === 2 ? "CONFIRM FINAL " + taken.row.id : "CONFIRM " + taken.row.id)
      : "";
    const done = finish(base, {
      code: taken.code, verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, taken.code === "ACTOR_DENIED" ? "Заявка принадлежит другому actor." : "Заявка не подтверждена."),
      approval: taken.row && taken.row.status === "pending" && phrase
        ? { id: taken.row.id, phrase, expiresAt: taken.row.expiresAt, stage: taken.row.stage }
        : null,
      trace: {
        ...emptyTrace(base.text, current.mode, taken.row?.normalized ?? "approval"),
        runbook: taken.row?.runbook ?? "—",
        target: taken.row?.target ?? "—",
        risk: (taken.row?.risk ?? 3) as 0 | 1 | 2 | 3,
      },
    });
    if (taken.row) rememberAudit(current.stateDir, taken.row.id, done.auditId);
    return done;
  }
  if (taken.action === "policy" || !book || !hinted) {
    return finish(base, {
      code: "POLICY_DENIED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, book?.policy === "DENY_ALWAYS" ? "DENY_ALWAYS нельзя отменить заявкой." : "Политика запрещает исполнение."),
      approval: null,
      trace: { ...emptyTrace(base.text, current.mode, parsed.normalized), runbook: book?.id ?? "—", target: hinted?.id ?? "—", risk: book?.risk ?? 3, policy: book?.policy ?? "DENY" },
    });
  }
  if (taken.action === "advance") {
    const done = finish(base, {
      code: "APPROVAL_REQUIRED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Требуется второй серверный этап подтверждения.", book.risk),
      approval: { id: taken.row.id, phrase: "CONFIRM FINAL " + taken.row.id, expiresAt: taken.row.expiresAt, stage: 2 },
      trace: traceOf(base.text, parsed.normalized, "нет", hinted.id, book, current.mode, "не вызывался", "ждёт второе подтверждение"),
    });
    rememberAudit(current.stateDir, taken.row.id, done.auditId);
    return done;
  }

  const exec = safeGateway(book, hinted.id, current.mode, current.stateDir, current.execute, normalizedParametersOf(parsed));
  const ok = exec.code === "DRY_RUN" || exec.code === "MOCK" || exec.code === "OK";
  try {
    settleApproval(current.stateDir, taken.row.id, ok ? "confirmed" : "failed");
  } catch {
    return finish(base, {
      code: "EXECUTION_FAILED", verdict: "deny", mode: current.mode, executionCalled: false,
      decision: denyShell(base.text, "Состояние заявки не позволило зафиксировать результат. Успех не подменяется."),
      approval: null,
      trace: traceOf(base.text, parsed.normalized, "нет", hinted.id, book, current.mode, exec.detail, "проверка не выполнялась"),
    });
  }
  const decision: Decision = {
    ...parsed, verdict: ok ? "allow" : "deny", reason: ok ? null : exec.detail, risk: book.risk, runbook: book.id, target: hinted.id, forceDeny: !ok,
    policyNotes: ["Решение принято на сервере.", "Режим " + current.mode + ".", exec.detail],
  };
  const done = finish(base, {
    code: ok ? "OK" : exec.code === "NOT_CONFIGURED" ? "EXECUTION_DISABLED" : exec.code,
    verdict: decision.verdict, mode: current.mode, executionCalled: exec.called, decision, approval: null,
    trace: traceOf(base.text, parsed.normalized, "нет", hinted.id, book, current.mode, exec.detail, exec.code === "OK" ? book.verification : "проверка не выполнялась"),
  });
  rememberAudit(current.stateDir, taken.row.id, done.auditId);
  return done;
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
  if (book.mutates && !canExecute(current.session?.role)) {
    return denied(base, current.mode, book.id, book.policy, book.risk, "ACTOR_DENIED", "Этой роли нельзя вызывать изменяющий инструмент.", parsed.normalized, constraint, book.risk);
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
    const opened = finish(base, {
      code: "APPROVAL_REQUIRED",
      verdict: "deny",
      mode: current.mode,
      executionCalled: false,
      decision,
      approval: { id: record.id, phrase: `CONFIRM ${record.id}`, expiresAt: record.expiresAt, stage: 1 },
      trace: traceOf(text, parsed.normalized, constraint, target.id, book, current.mode, "заявка, исполнитель не вызывался", "ждёт заявку"),
    });
    rememberAudit(current.stateDir, record.id, opened.auditId);
    return opened;
  }
  const exec = safeGateway(
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
