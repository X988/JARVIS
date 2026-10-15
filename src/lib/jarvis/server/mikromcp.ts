import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAudit } from "../audit-log.ts";
import type { ExecCall, ExecResult } from "./pipeline.ts";

/**
 * MikroMCP adapter (https://github.com/AliKarami/MikroMCP). JARVIS runbooks are
 * mapped onto a FIXED allowlist of read-only MikroMCP tools. Anything that can
 * change the router (manage_*, run_command, reboot, apply_plan …) is refused
 * here and again in the client script, even if the server offers it.
 */
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_mikromcp.mjs");

export const MIKROMCP_READ_TOOLS: Record<string, { tool: string; args: Record<string, unknown> }> = {
  "mikrotik.status": { tool: "get_system_status", args: {} },
  "mikrotik.interfaces": { tool: "list_interfaces", args: { limit: 100 } },
  "mikrotik.routes": { tool: "list_routes", args: { limit: 100 } },
  "mikrotik.dhcp": { tool: "list_dhcp_leases", args: { limit: 100 } },
  "mikrotik.firewall.counters": { tool: "list_firewall_rules", args: { table: "filter", limit: 100 } },
  "mikrotik.logs": { tool: "get_log", args: { limit: 50 } },
  "mikrotik.wireguard": { tool: "list_wireguard_peers", args: { limit: 100 } },
  "wireguard.status": { tool: "list_wireguard_peers", args: { limit: 100 } },
};

const WRITE_LIKE = /^(manage|set|run|write|delete|upload|reboot|apply|rollback|create|export|fetch|bulk_execute|plan)_?|run_command/;
export const ALLOWED_TOOLS = new Set(Object.values(MIKROMCP_READ_TOOLS).map((item) => item.tool));

export function isAllowedMikroMcpTool(name: string): boolean {
  return ALLOWED_TOOLS.has(name) && !WRITE_LIKE.test(name);
}

/** Filters a server tool list down to what JARVIS will ever call. */
export function exposedTools(tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>): string[] {
  return tools.filter((t) => t.annotations?.readOnlyHint === true && isAllowedMikroMcpTool(t.name)).map((t) => t.name);
}

export function mikroMcpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.JARVIS_MIKROMCP_URL?.trim() ?? "";
  if (!url || !env.JARVIS_MIKROMCP_TOKEN?.trim()) return false;
  // Plain HTTP is only acceptable to a loopback MCP server.
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

const MAC = /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g;
type Row = Record<string, unknown>;
const truthy = (v: unknown) => v === true || v === "true";
const arr = (s: Row | null, key: string): Row[] => (Array.isArray(s?.[key]) ? (s![key] as Row[]) : []);

export function summarize(runbook: string, structured: Row | null, text: string): string {
  const s = structured ?? {};
  if (runbook === "mikrotik.status") {
    const res = ((s.sections as Row | undefined)?.resource ?? {}) as Row;
    const free = Number(res["free-memory"]);
    const total = Number(res["total-memory"]);
    const mem = total ? `${Math.round(((total - free) / total) * 100)}% (${Math.round(free / 1048576)} MiB free of ${Math.round(total / 1048576)} MiB)` : "?";
    return `board=${res["board-name"] ?? "?"}; routeros=${res.version ?? "?"}; uptime=${res.uptime ?? "?"}; cpu_load=${res["cpu-load"] ?? "?"}%; memory_used=${mem}`;
  }
  if (runbook === "mikrotik.interfaces") {
    const rows = arr(s, "interfaces");
    const enabled = rows.filter((r) => !truthy(r.disabled));
    const down = enabled.filter((r) => !truthy(r.running)).map((r) => String(r.name)).slice(0, 10);
    return `interfaces=${rows.length}; running=${enabled.length - down.length}; disabled=${rows.length - enabled.length}; down=${down.join(",") || "none"}`;
  }
  if (runbook === "mikrotik.dhcp") {
    const rows = arr(s, "leases");
    const total = Number(s.total ?? rows.length);
    return `leases=${total}; bound=${rows.filter((r) => r.status === "bound").length}; dynamic=${rows.filter((r) => truthy(r.dynamic)).length}; static=${rows.filter((r) => !truthy(r.dynamic)).length}`;
  }
  if (runbook === "mikrotik.routes") {
    const rows = arr(s, "routes");
    const defaults = rows.filter((r) => r["dst-address"] === "0.0.0.0/0");
    return `routes=${s.total ?? rows.length}; active=${rows.filter((r) => truthy(r.active)).length}; default_routes=${defaults.length}; default_active=${defaults.filter((r) => truthy(r.active)).length}`;
  }
  if (runbook === "mikrotik.firewall.counters") {
    const rows = arr(s, "rules");
    return `filter_rules=${s.total ?? rows.length}; disabled=${rows.filter((r) => truthy(r.disabled)).length}`;
  }
  if (runbook === "mikrotik.logs") {
    const rows = arr(s, "entries").slice(0, 5).map((r) => `[${r.time}] ${String(r.topics)}: ${String(r.message).replace(MAC, "<mac>").slice(0, 120)}`);
    return `log_entries=${s.total ?? "?"}; latest: ${rows.join(" | ")}`;
  }
  if (runbook === "mikrotik.wireguard" || runbook === "wireguard.status") {
    const rows = arr(s, "peers");
    return `wireguard_peers=${s.total ?? rows.length}`;
  }
  return text.replace(MAC, "<mac>").slice(0, 400);
}

/** A slow CCR1009 needs ~8-12 s for get_system_status (several REST sections). */
export const MIKROMCP_DEFAULT_TIMEOUT_MS = 20_000;
/** Extra time the parent gives the client process beyond its own request timeout. */
export const MIKROMCP_PROCESS_MARGIN_MS = 3_000;

export function mikroMcpTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return timeoutMs(env);
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const v = Number(env.JARVIS_MIKROMCP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.min(60_000, Math.max(1_000, v)) : MIKROMCP_DEFAULT_TIMEOUT_MS;
}

export type CallStatus = "ok" | "error" | "timeout" | "denied";

export function statusOf(code: string): CallStatus {
  if (code === "OK") return "ok";
  if (code === "POLICY_DENIED") return "denied";
  if (code === "EXECUTION_TIMEOUT") return "timeout";
  return "error";
}

/** Normalizes whatever the client produced into a known string result code. */
export function normalizeCode(raw: unknown): string {
  const code = typeof raw === "string" ? raw : "";
  return /^[A-Z][A-Z_]{1,40}$/.test(code) ? code : "MIKROMCP_ERROR";
}

/**
 * One hash-chained audit row per router call, success or failure. `executor`
 * is "mikromcp" or "routeros-rest". A failed audit write is reported on stderr
 * rather than silently swallowed (the pipeline row still records the runbook).
 */
export function auditRouterCall(
  env: NodeJS.ProcessEnv,
  call: ExecCall,
  executor: "mikromcp" | "routeros-rest",
  tool: string,
  code: string,
  durationMs: number,
  detail = "",
): void {
  const status = statusOf(code);
  try {
    appendAudit(
      {
        at: new Date().toISOString(),
        executionId: `${executor}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actor: "jarvis",
        action: `${executor === "mikromcp" ? "mikromcp.call" : "routeros.call"}:${tool}`,
        verdict: status === "denied" ? "deny" : "allow",
        normalized: `${executor} ${tool} router=${env.JARVIS_MIKROMCP_ROUTER_ID || "mikrotik-kp"} status=${status}`,
        target: call.target,
        runbook: call.runbook,
        executor,
        durationMs,
        result: code,
        // status lives in hashed fields (normalized + error), not an unhashed extra key.
        error: status === "ok" ? "" : `${status}: ` + String(detail).replace(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g, "<mac>").slice(0, 200),
        channel: call.channel ?? "agent",
        tool,
      },
      env.JARVIS_STATE_DIR?.trim() || undefined,
    );
  } catch (error) {
    console.error(`[jarvis] audit write for ${executor}:${tool} failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
  }
}

/** Returns an ExecResult, or null when MikroMCP should not / could not answer (caller falls back to REST). */
export function runMikroMcp(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult | { fallback: string } {
  if (!mikroMcpConfigured(env)) return { fallback: "not configured" };
  const mapping = MIKROMCP_READ_TOOLS[call.runbook];
  if (!mapping || !isAllowedMikroMcpTool(mapping.tool)) return { fallback: "no read-only mapping" };
  const args = { routerId: env.JARVIS_MIKROMCP_ROUTER_ID?.trim() || "mikrotik-kp", ...mapping.args };
  const started = Date.now();
  const run = spawnSync(process.execPath, [script, "call", mapping.tool], {
    encoding: "utf8",
    timeout: timeoutMs(env) + MIKROMCP_PROCESS_MARGIN_MS,
    env: {
      PATH: process.env.PATH ?? "",
      JARVIS_MIKROMCP_URL: env.JARVIS_MIKROMCP_URL,
      JARVIS_MIKROMCP_TOKEN: env.JARVIS_MIKROMCP_TOKEN,
      JARVIS_MIKROMCP_TIMEOUT_MS: String(timeoutMs(env)),
      JARVIS_MIKROMCP_ALLOWED: [...ALLOWED_TOOLS].join(","),
      JARVIS_MIKROMCP_ARGS: JSON.stringify(args),
    },
  });
  let body: { code?: string; detail?: string; text?: string; structured?: Row | null } = {};
  try {
    body = JSON.parse(run.stdout || "{}");
  } catch {
    body = { code: "VERIFICATION_FAILED" };
  }
  const code = run.error ? "EXECUTION_TIMEOUT" : normalizeCode(body.code || "VERIFICATION_FAILED");
  auditRouterCall(env, call, "mikromcp", mapping.tool, code, Date.now() - started, run.error ? "client process timeout" : body.detail ?? "");
  if (code === "POLICY_DENIED") return { called: false, code, detail: `mikromcp: ${body.detail ?? "denied"}` };
  if (code !== "OK") return { fallback: `${code}${body.detail ? ": " + String(body.detail).slice(0, 120) : ""}` };
  return { called: true, code: "OK", detail: `mikromcp:${mapping.tool}: ${summarize(call.runbook, body.structured ?? null, body.text ?? "")}` };
}
