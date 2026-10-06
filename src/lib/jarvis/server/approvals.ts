import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

function readAll(dir: string): ApprovalRecord[] {
  const target = file(dir);
  if (!fs.existsSync(target)) return [];
  return JSON.parse(fs.readFileSync(target, "utf8")) as ApprovalRecord[];
}

function writeAll(dir: string, rows: ApprovalRecord[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(rows));
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

export function createApproval(dir: string, row: Omit<ApprovalRecord, "status" | "stage">): ApprovalRecord {
  const stored: ApprovalRecord = { ...row, stage: 1, status: "pending" };
  writeAll(dir, [...readAll(dir), stored]);
  return stored;
}

export function findApproval(dir: string, id: string): ApprovalRecord | null {
  return readAll(dir).find((item) => item.id === id) ?? null;
}

export function saveApproval(dir: string, next: ApprovalRecord): void {
  writeAll(dir, readAll(dir).map((item) => (item.id === next.id ? next : item)));
}
