import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";

export type ApprovalStatus = "pending" | "confirmed" | "expired" | "mismatch";

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
};

function file(dir: string): string {
  return path.join(dir, "approvals.json");
}

function stringRecord(value: unknown): value is Record<string, string> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).every(
      ([key, item]) => /^[A-Za-z0-9_.:-]{1,96}$/.test(key) && typeof item === "string" && item.length <= 4_000,
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
  const parameters = Object.entries(parts.normalizedParameters).sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256")
    .update(JSON.stringify([parts.runbook, parts.target, parts.normalized, parts.constraint, parameters]))
    .digest("hex");
}

function validApproval(value: unknown): value is ApprovalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<ApprovalRecord>;
  if (
    typeof row.id !== "string" ||
    !/^APPROVAL-[A-Z0-9-]{8,80}$/.test(row.id) ||
    typeof row.actorId !== "string" ||
    !/^[A-Za-z0-9._:@-]{1,128}$/.test(row.actorId) ||
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
    !["pending", "confirmed", "expired", "mismatch"].includes(String(row.status))
  ) {
    return false;
  }

  return row.parameterHash === parameterHash({
    runbook: row.runbook,
    target: row.target,
    normalized: row.normalized,
    constraint: row.constraint,
    normalizedParameters: row.normalizedParameters,
  });
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
  return parsed.map((row) => ({ ...row, normalizedParameters: { ...row.normalizedParameters } }));
}

function writeAll(dir: string, rows: ApprovalRecord[]): void {
  if (!rows.every(validApproval)) throw new Error("refusing to persist invalid approval state");
  fs.mkdirSync(dir, { recursive: true });
  const target = file(dir);
  const next = `${target}.tmp`;
  fs.writeFileSync(next, JSON.stringify(rows));
  fs.renameSync(next, target);
}

export function createApproval(dir: string, row: Omit<ApprovalRecord, "status" | "stage">): ApprovalRecord {
  const stored: ApprovalRecord = { ...row, stage: 1, status: "pending" };
  if (!validApproval(stored)) throw new Error("invalid approval record");
  withStateLock(dir, () => writeAll(dir, [...readAll(dir), stored]));
  return stored;
}

export function findApproval(dir: string, id: string): ApprovalRecord | null {
  return readAll(dir).find((item) => item.id === id) ?? null;
}

export function saveApproval(dir: string, next: ApprovalRecord): void {
  if (!validApproval(next)) throw new Error("invalid approval record");
  withStateLock(dir, () => {
    const rows = readAll(dir);
    const index = rows.findIndex((item) => item.id === next.id);
    if (index < 0) throw new Error("approval record not found");
    rows[index] = next;
    writeAll(dir, rows);
  });
}
