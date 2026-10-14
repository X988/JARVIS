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
  channel?: string;
  tool?: string;
  error?: string;
  hash?: string;
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b(password|passwd|secret|api[_-]?key|token|authorization)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]"],
  [/\bsk-[A-Za-z0-9]{8,}\b/g, "[REDACTED_KEY]"],
];

/** Removes credentials before they are hashed into the audit chain. */
export function redactSecrets(value: string): string {
  let next = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

export function auditFile(dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data")): string {
  return path.join(dir, "audit.jsonl");
}

function canon(row: Omit<AuditRow, "hash">): string {
  const legacy = [
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
  ];
  // Rows written before channel/tool/error keep version 1. New rows set channel.
  if (!row.channel && !row.tool && row.error === undefined) return JSON.stringify(legacy);
  return JSON.stringify([
    2,
    ...legacy.slice(1),
    row.channel ?? "",
    row.tool ?? "",
    row.error ?? "",
  ]);
}

function redactRow(row: Omit<AuditRow, "previousHash" | "hash">): Omit<AuditRow, "previousHash" | "hash"> {
  const text = (value: string | undefined) => (value === undefined ? undefined : redactSecrets(value));
  return {
    ...row,
    action: redactSecrets(row.action),
    actor: redactSecrets(row.actor),
    normalized: text(row.normalized),
    result: text(row.result),
    verification: text(row.verification),
    error: text(row.error),
    executor: text(row.executor),
    target: text(row.target),
    runbook: text(row.runbook),
    tool: text(row.tool),
    policy: text(row.policy),
  };
}

export function appendAudit(row: Omit<AuditRow, "previousHash" | "hash">, dir?: string): AuditRow {
  const file = auditFile(dir);
  const stateDir = path.dirname(file);
  const stored = withStateLock(stateDir, () => {
    const integrity = verifyAudit(stateDir);
    if (!integrity.ok) throw new Error("audit integrity");
    fs.mkdirSync(stateDir, { recursive: true });
    let previousHash = "GENESIS";
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length) previousHash = (JSON.parse(lines[lines.length - 1]) as AuditRow).hash || "GENESIS";
    }
    const body = { ...redactRow(row), previousHash };
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

export type AuditIntegrity = { ok: boolean; rows: number; reason: "ok" | "invalid-json" | "chain" | "hash" };

export function verifyAudit(dir?: string): AuditIntegrity {
  const file = auditFile(dir);
  if (!fs.existsSync(file)) return { ok: true, rows: 0, reason: "ok" };
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  let previous = "GENESIS";
  for (const line of lines) {
    let row: AuditRow;
    try {
      row = JSON.parse(line) as AuditRow;
    } catch {
      return { ok: false, rows: lines.length, reason: "invalid-json" };
    }
    if (!row || typeof row !== "object" || row.previousHash !== previous) {
      return { ok: false, rows: lines.length, reason: "chain" };
    }
    const { hash, ...body } = row;
    const again = createHash("sha256").update(canon(body)).digest("hex");
    if (again !== hash) return { ok: false, rows: lines.length, reason: "hash" };
    previous = hash || previous;
  }
  return { ok: true, rows: lines.length, reason: "ok" };
}

/** Local alert outside the hash chain. A broken chain must not gain new rows. */
export function recordAuditIntegrityAlert(
  dir: string,
  alert: { at: string; requestId: string; actor: string; rows: number; reason: string },
): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "audit-integrity-alert.json");
  const body = JSON.stringify({ ...alert, execution: "refused" });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);
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
  const rows: string[] = [];
  if (env.JARVIS_AUDIT_SYSLOG?.trim()) rows.push("syslog:ADAPTER_DISABLED");

  for (const [id, raw] of [
    ["http", env.JARVIS_AUDIT_HTTP_URL],
    ["loki", env.JARVIS_AUDIT_LOKI_URL],
  ] as const) {
    if (!raw?.trim()) continue;
    try {
      const url = new URL(raw);
      const valid =
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        !url.hash;
      rows.push(`${id}:${valid ? "OUTBOX" : "INVALID"}`);
    } catch {
      rows.push(`${id}:INVALID`);
    }
  }

  return rows.length ? rows.join(",") : "NOT_CONFIGURED";
}
