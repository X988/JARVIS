import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type AuditRow = {
  at: string;
  executionId: string;
  actor: string;
  action: string;
  verdict: string;
  previousHash: string;
  hash?: string;
};

export function auditFile(dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data")): string {
  return path.join(dir, "audit.jsonl");
}

function canon(row: Omit<AuditRow, "hash">): string {
  return JSON.stringify([row.at, row.executionId, row.actor, row.action, row.verdict, row.previousHash]);
}

export function appendAudit(row: Omit<AuditRow, "previousHash" | "hash">, dir?: string): AuditRow {
  const file = auditFile(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let previousHash = "GENESIS";
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) previousHash = (JSON.parse(lines[lines.length - 1]) as AuditRow).hash || "GENESIS";
  }
  const body = { ...row, previousHash };
  const hash = createHash("sha256").update(canon(body)).digest("hex");
  const stored = { ...body, hash };
  fs.appendFileSync(file, `${JSON.stringify(stored)}\n`);
  return stored;
}

export function verifyAudit(dir?: string): { ok: boolean; rows: number } {
  const file = auditFile(dir);
  if (!fs.existsSync(file)) return { ok: true, rows: 0 };
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  let previous = "GENESIS";
  for (const line of lines) {
    const row = JSON.parse(line) as AuditRow;
    if (row.previousHash !== previous) return { ok: false, rows: lines.length };
    const { hash, ...body } = row;
    const again = createHash("sha256").update(canon(body)).digest("hex");
    if (again !== hash) return { ok: false, rows: lines.length };
    previous = hash || previous;
  }
  return { ok: true, rows: lines.length };
}
