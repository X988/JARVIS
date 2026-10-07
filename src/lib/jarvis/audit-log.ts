import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./server/state-lock.ts";
import { enqueueAuditDelivery } from "./audit-outbox.ts";

export type AuditRow = {
  at: string;
  executionId: string;
  actor: string;
  action: string;
  verdict: string;
  previousHash: string;
  sessionId?: string;
  commandId?: string;
  normalized?: string;
  target?: string;
  runbook?: string;
  risk?: number | string;
  policy?: string;
  approvalId?: string;
  executor?: string;
  durationMs?: number | string;
  result?: string;
  verification?: string;
  externalSink?: string;
  hash?: string;
};

export function auditFile(dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data")): string {
  return path.join(dir, "audit.jsonl");
}

function canon(row: Omit<AuditRow, "hash">): string {
  return JSON.stringify([
    1,
    row.at,
    row.executionId,
    row.actor,
    row.action,
    row.verdict,
    row.previousHash,
    row.sessionId ?? "",
    row.commandId ?? "",
    row.normalized ?? "",
    row.target ?? "",
    row.runbook ?? "",
    String(row.risk ?? ""),
    row.policy ?? "",
    row.approvalId ?? "",
    row.executor ?? "",
    String(row.durationMs ?? ""),
    row.result ?? "",
    row.verification ?? "",
    row.externalSink ?? "NOT_CONFIGURED",
  ]);
}

export function appendAudit(row: Omit<AuditRow, "previousHash" | "hash">, dir?: string): AuditRow {
  const file = auditFile(dir);
  const stateDir = path.dirname(file);
  const stored = withStateLock(stateDir, () => {
    fs.mkdirSync(stateDir, { recursive: true });
    let previousHash = "GENESIS";
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length) previousHash = (JSON.parse(lines[lines.length - 1]) as AuditRow).hash || "GENESIS";
    }
    const body = { ...row, previousHash };
    const hash = createHash("sha256").update(canon(body)).digest("hex");
    const saved = { ...body, hash };
    fs.appendFileSync(file, `${JSON.stringify(saved)}\n`);
    return saved;
  });

  // External delivery is decoupled from command execution. A durable outbox is
  // queued only after the local hash-chain row exists.
  enqueueAuditDelivery(stored, stateDir);
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

export interface AuditSink {
  readonly id: "syslog" | "http" | "loki";
  status(): "NOT_CONFIGURED" | "OUTBOX" | "ADAPTER_DISABLED";
}

class EnvAuditSink implements AuditSink {
  readonly id: AuditSink["id"];
  private readonly envName: string;

  constructor(id: AuditSink["id"], envName: string) {
    this.id = id;
    this.envName = envName;
  }

  status(): "NOT_CONFIGURED" | "OUTBOX" | "ADAPTER_DISABLED" {
    if (!process.env[this.envName]) return "NOT_CONFIGURED";
    return this.id === "syslog" ? "ADAPTER_DISABLED" : "OUTBOX";
  }
}

export class SyslogAuditSink extends EnvAuditSink {
  constructor() {
    super("syslog", "JARVIS_AUDIT_SYSLOG");
  }
}

export class HttpAuditSink extends EnvAuditSink {
  constructor() {
    super("http", "JARVIS_AUDIT_HTTP_URL");
  }
}

export class LokiAuditSink extends EnvAuditSink {
  constructor() {
    super("loki", "JARVIS_AUDIT_LOKI_URL");
  }
}

/**
 * Local hash chain detects a changed line, not a file that was replaced wholesale.
 * An external sink is the anchor. Until one is actually connected, this stays
 * NOT_CONFIGURED or ADAPTER_DISABLED and never reports a delivered copy.
 */
export function externalSinkLabel(env: NodeJS.ProcessEnv = process.env): string {
  const sinks = [
    ["syslog", env.JARVIS_AUDIT_SYSLOG],
    ["http", env.JARVIS_AUDIT_HTTP_URL],
    ["loki", env.JARVIS_AUDIT_LOKI_URL],
  ] as const;
  const active = sinks.filter(([, value]) => Boolean(value));
  if (active.length === 0) return "NOT_CONFIGURED";
  return active
    .map(([id]) => `${id}:${id === "syslog" ? "ADAPTER_DISABLED" : "OUTBOX"}`)
    .join(",");
}
