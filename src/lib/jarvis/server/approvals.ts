import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";

export type ApprovalStatus =
  | "pending"
  | "confirmed"
  | "expired"
  | "mismatch"
  | "rejected"
  | "executing"
  | "failed";

export type ApprovalRecord = {
  id: string;
  actorId: string;
  runbook: string;
  target: string;
  normalized: string;
  normalizedParameters: Record<string, string>;
  constraint: string;
  parameterHash: string;
  risk: number;
  createdAt: number;
  expiresAt: number;
  stage: 1 | 2;
  required: 1 | 2;
  status: ApprovalStatus;
  /** Audit-chain hashes linked to this request. Not part of the parameter hash. */
  auditIds?: string[];
};

function file(dir: string): string {
  return path.join(dir, "approvals.json");
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(raw);
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function validActorId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 8_192 &&
    !hasControlCharacters(value)
  );
}

function stringRecord(value: unknown): value is Record<string, string> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value as Record<string, unknown>).every(
        ([key, item]) =>
          /^[A-Za-z0-9_.:-]{1,96}$/.test(key) &&
          typeof item === "string" &&
          item.length <= 4_000,
      ),
  );
}

export function parameterHash(parts: {
  runbook: string;
  target: string;
  normalized: string;
  constraint: string;
  normalizedParameters: Record<string, string>;
}): string {
  const parameters = Object.entries(parts.normalizedParameters).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return createHash("sha256")
    .update(
      JSON.stringify([
        parts.runbook,
        parts.target,
        parts.normalized,
        parts.constraint,
        parameters,
      ]),
    )
    .digest("hex");
}

function validAuditIds(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
    value.every((item) => typeof item === "string" && /^[A-Za-z0-9-]{8,80}$/.test(item))
  );
}

function validApproval(value: unknown): value is ApprovalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<ApprovalRecord>;
  if (
    typeof row.id !== "string" ||
    !/^APPROVAL-[A-Z0-9-]{8,80}$/.test(row.id) ||
    typeof row.actorId !== "string" ||
    !validActorId(row.actorId) ||
    typeof row.runbook !== "string" ||
    !/^[a-z][a-z0-9.-]{1,95}$/.test(row.runbook) ||
    typeof row.target !== "string" ||
    !/^[A-Za-z0-9._:-]{1,96}$/.test(row.target) ||
    typeof row.normalized !== "string" ||
    row.normalized.length > 4_000 ||
    !stringRecord(row.normalizedParameters) ||
    typeof row.constraint !== "string" ||
    row.constraint.length > 1_000 ||
    typeof row.parameterHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.parameterHash) ||
    typeof row.risk !== "number" ||
    !Number.isInteger(row.risk) ||
    row.risk < 0 ||
    row.risk > 3 ||
    typeof row.createdAt !== "number" ||
    !Number.isFinite(row.createdAt) ||
    typeof row.expiresAt !== "number" ||
    !Number.isFinite(row.expiresAt) ||
    row.expiresAt <= row.createdAt ||
    (row.stage !== 1 && row.stage !== 2) ||
    (row.required !== 1 && row.required !== 2) ||
    row.stage > row.required ||
    !["pending", "confirmed", "expired", "mismatch", "rejected", "executing", "failed"].includes(
      String(row.status),
    ) ||
    !validAuditIds(row.auditIds)
  ) {
    return false;
  }

  return (
    row.parameterHash ===
    parameterHash({
      runbook: row.runbook,
      target: row.target,
      normalized: row.normalized,
      constraint: row.constraint,
      normalizedParameters: row.normalizedParameters,
    })
  );
}

function readAll(dir: string): ApprovalRecord[] {
  const target = file(dir);
  if (!fs.existsSync(target)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch {
    throw new Error("approval state is invalid JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every(validApproval)) {
    throw new Error("approval state has invalid records");
  }
  return parsed.map((row) => ({
    ...row,
    normalizedParameters: { ...row.normalizedParameters },
    ...(row.auditIds ? { auditIds: [...row.auditIds] } : {}),
  }));
}

function writeAll(dir: string, rows: ApprovalRecord[]): void {
  if (!rows.every(validApproval)) {
    throw new Error("refusing to persist invalid approval state");
  }
  fs.mkdirSync(dir, { recursive: true });
  const target = file(dir);
  const next = `${target}.tmp`;
  fs.writeFileSync(next, JSON.stringify(rows));
  fs.renameSync(next, target);
}

function retainedApprovals(
  rows: ApprovalRecord[],
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): ApprovalRecord[] {
  const retentionMs = boundedInteger(
    env.JARVIS_APPROVAL_RETENTION_MS,
    30 * 24 * 60 * 60 * 1000,
    60_000,
    365 * 24 * 60 * 60 * 1000,
  );
  // The approval itself is unusable after expiresAt. Retention only controls
  // how long that security evidence remains in this operational state file;
  // the append-only audit remains the durable history.
  return rows.filter((row) => now - row.expiresAt <= retentionMs);
}

function maxRecords(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInteger(
    env.JARVIS_APPROVAL_MAX_RECORDS,
    20_000,
    100,
    100_000,
  );
}

export function createApproval(
  dir: string,
  row: Omit<ApprovalRecord, "status" | "stage">,
): ApprovalRecord {
  const stored: ApprovalRecord = { ...row, stage: 1, status: "pending" };
  if (!validApproval(stored)) throw new Error("invalid approval record");
  withStateLock(dir, () => {
    const rows = retainedApprovals(readAll(dir));
    if (rows.length >= maxRecords()) {
      throw new Error("approval state capacity reached");
    }
    writeAll(dir, [...rows, stored]);
  });
  return stored;
}

export function findApproval(
  dir: string,
  id: string,
): ApprovalRecord | null {
  return readAll(dir).find((item) => item.id === id) ?? null;
}

export function saveApproval(dir: string, next: ApprovalRecord): void {
  if (!validApproval(next)) throw new Error("invalid approval record");
  withStateLock(dir, () => {
    const rows = retainedApprovals(readAll(dir));
    const index = rows.findIndex((item) => item.id === next.id);
    if (index < 0) throw new Error("approval record not found");
    rows[index] = next;
    writeAll(dir, rows);
  });
}

export type ApprovalTake =
  | { action: "missing" }
  | {
      action: "deny";
      code: "ACTOR_DENIED" | "APPROVAL_EXPIRED" | "APPROVAL_MISMATCH" | "APPROVAL_CLOSED";
      row: ApprovalRecord | null;
    }
  | { action: "rejected"; row: ApprovalRecord }
  | { action: "advance"; row: ApprovalRecord }
  | { action: "ready"; row: ApprovalRecord }
  | { action: "policy"; row: ApprovalRecord };

/**
 * Single locked transition. Concurrent confirmations serialize on state.lock;
 * the loser sees `executing` / `confirmed` and cannot run the gateway again.
 */
export function takeApproval(
  dir: string,
  input: {
    id: string;
    actorId: string;
    now: number;
    decision: "confirm" | "reject";
    phrase: string;
    expectedHash: string;
    risk: number;
    policyDeny: boolean;
  },
): ApprovalTake {
  return withStateLock(dir, () => {
    const rows = retainedApprovals(readAll(dir), input.now);
    const index = rows.findIndex((item) => item.id === input.id);
    if (index < 0) return { action: "missing" as const };
    const row = rows[index];
    if (!row) return { action: "missing" as const };
    if (row.actorId !== input.actorId) return { action: "deny" as const, code: "ACTOR_DENIED" as const, row };
    if (row.expiresAt <= input.now || row.status === "expired") {
      const expired = { ...row, status: "expired" as const };
      rows[index] = expired;
      writeAll(dir, rows);
      return { action: "deny" as const, code: "APPROVAL_EXPIRED" as const, row: expired };
    }
    if (row.status !== "pending") {
      const code =
        row.status === "mismatch"
          ? ("APPROVAL_MISMATCH" as const)
          : ("APPROVAL_CLOSED" as const);
      return { action: "deny" as const, code, row };
    }
    if (input.decision === "reject") {
      const rejected = { ...row, status: "rejected" as const };
      rows[index] = rejected;
      writeAll(dir, rows);
      return { action: "rejected" as const, row: rejected };
    }
    const expected = row.required === 2 && row.stage === 2 ? "CONFIRM FINAL " + row.id : "CONFIRM " + row.id;
    if (input.phrase.trim() !== expected) {
      return { action: "deny" as const, code: "APPROVAL_MISMATCH" as const, row };
    }
    if (input.expectedHash !== row.parameterHash || input.risk !== row.risk) {
      const mismatch = { ...row, status: "mismatch" as const };
      rows[index] = mismatch;
      writeAll(dir, rows);
      return { action: "deny" as const, code: "APPROVAL_MISMATCH" as const, row: mismatch };
    }
    if (input.policyDeny) return { action: "policy" as const, row };
    if (row.required === 2 && row.stage === 1) {
      const next = { ...row, stage: 2 as const };
      rows[index] = next;
      writeAll(dir, rows);
      return { action: "advance" as const, row: next };
    }
    const executing = { ...row, status: "executing" as const };
    rows[index] = executing;
    writeAll(dir, rows);
    return { action: "ready" as const, row: executing };
  });
}

export function settleApproval(
  dir: string,
  id: string,
  status: "confirmed" | "failed",
): ApprovalRecord {
  return withStateLock(dir, () => {
    const rows = readAll(dir);
    const index = rows.findIndex((item) => item.id === id);
    const current = index >= 0 ? rows[index] : undefined;
    if (!current) throw new Error("approval record not found");
    if (current.status !== "executing") throw new Error("approval is not executing");
    const next = { ...current, status };
    rows[index] = next;
    writeAll(dir, rows);
    return next;
  });
}

export function attachApprovalAudit(dir: string, id: string, auditId: string): void {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(auditId)) return;
  withStateLock(dir, () => {
    const rows = readAll(dir);
    const index = rows.findIndex((item) => item.id === id);
    const current = index >= 0 ? rows[index] : undefined;
    if (!current) return;
    const ids = current.auditIds ?? [];
    if (ids.includes(auditId)) return;
    rows[index] = { ...current, auditIds: [...ids, auditId].slice(-16) };
    writeAll(dir, rows);
  });
}
