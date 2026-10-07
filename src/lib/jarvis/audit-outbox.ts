import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./server/state-lock.ts";
import type { AuditRow } from "./audit-log.ts";

export type AuditSinkId = "http" | "loki" | "syslog";

export type AuditEnvelope = {
  id: string;
  queuedAt: string;
  row: AuditRow;
  pending: AuditSinkId[];
};

export function auditOutboxFile(
  dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"),
): string {
  return path.join(dir, "audit-outbox.jsonl");
}

function configuredSinks(env: NodeJS.ProcessEnv): AuditSinkId[] {
  const out: AuditSinkId[] = [];
  if (env.JARVIS_AUDIT_HTTP_URL?.trim()) out.push("http");
  if (env.JARVIS_AUDIT_LOKI_URL?.trim()) out.push("loki");
  if (env.JARVIS_AUDIT_SYSLOG?.trim()) out.push("syslog");
  return out;
}

function validHttpUrl(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function loadAuditOutbox(dir?: string): AuditEnvelope[] {
  const file = auditOutboxFile(dir);
  if (!fs.existsSync(file)) return [];
  const rows: AuditEnvelope[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as AuditEnvelope;
      if (
        item &&
        typeof item.id === "string" &&
        typeof item.queuedAt === "string" &&
        item.row &&
        Array.isArray(item.pending)
      ) {
        rows.push(item);
      }
    } catch {
      // Keep malformed source untouched; flush only works with validated rows.
    }
  }
  return rows;
}

function rewriteOutbox(dir: string, rows: AuditEnvelope[]): void {
  const file = auditOutboxFile(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(temp, body ? body + "\n" : "");
  fs.renameSync(temp, file);
}

export function enqueueAuditDelivery(
  row: AuditRow,
  dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"),
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): boolean {
  const pending = configuredSinks(env);
  if (!pending.length || !row.hash) return false;
  return withStateLock(dir, () => {
    const rows = loadAuditOutbox(dir);
    if (rows.some((item) => item.id === row.hash)) return false;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      auditOutboxFile(dir),
      JSON.stringify({ id: row.hash, queuedAt: now.toISOString(), row, pending } satisfies AuditEnvelope) + "\n",
    );
    return true;
  });
}

async function postJson(
  url: URL,
  body: unknown,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function deliver(
  sink: AuditSinkId,
  row: AuditRow,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  if (sink === "http") {
    const url = validHttpUrl(env.JARVIS_AUDIT_HTTP_URL);
    return url ? postJson(url, row, fetcher, timeoutMs) : false;
  }
  if (sink === "loki") {
    const url = validHttpUrl(env.JARVIS_AUDIT_LOKI_URL);
    if (!url) return false;
    const ns = String(BigInt(Date.now()) * 1_000_000n);
    return postJson(
      url,
      {
        streams: [
          {
            stream: { service: "jarvis", kind: "audit" },
            values: [[ns, JSON.stringify(row)]],
          },
        ],
      },
      fetcher,
      timeoutMs,
    );
  }
  // Syslog transport is intentionally not faked. It stays pending until a
  // dedicated UDP/TLS transport is configured and tested.
  return false;
}

export async function flushAuditOutbox(
  dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"),
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ attempted: number; delivered: number; remaining: number }> {
  const snapshot = loadAuditOutbox(dir);
  if (!snapshot.length) return { attempted: 0, delivered: 0, remaining: 0 };
  const rawTimeout = Number(env.JARVIS_AUDIT_TIMEOUT_MS ?? 5_000);
  const timeoutMs = Number.isFinite(rawTimeout)
    ? Math.max(1_000, Math.min(30_000, Math.trunc(rawTimeout)))
    : 5_000;

  const results = new Map<string, AuditSinkId[]>();
  let attempted = 0;
  let delivered = 0;
  for (const envelope of snapshot) {
    const pending: AuditSinkId[] = [];
    for (const sink of envelope.pending) {
      attempted += 1;
      if (await deliver(sink, envelope.row, env, fetcher, timeoutMs)) delivered += 1;
      else pending.push(sink);
    }
    results.set(envelope.id, pending);
  }

  return withStateLock(dir, () => {
    const current = loadAuditOutbox(dir);
    const next = current
      .map((item) => {
        const pending = results.get(item.id);
        return pending ? { ...item, pending } : item;
      })
      .filter((item) => item.pending.length > 0);
    rewriteOutbox(dir, next);
    return { attempted, delivered, remaining: next.length };
  });
}
