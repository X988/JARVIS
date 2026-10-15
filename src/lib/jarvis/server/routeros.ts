import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecCall, ExecResult } from "./pipeline.ts";
import { auditRouterCall, runMikroMcp } from "./mikromcp.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_routeros.mjs");

export const ROUTEROS_DEFAULT_TIMEOUT_MS = 15_000;
export const ROUTEROS_PROCESS_MARGIN_MS = 5_000;

export function routerOsTimeoutMs(raw: string | undefined): number {
  return timeoutMs(raw);
}

function timeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return ROUTEROS_DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value)) return ROUTEROS_DEFAULT_TIMEOUT_MS;
  return Math.min(60_000, Math.max(2_000, Math.trunc(value)));
}

const CHANGE_RUNBOOKS = new Set(["mikrotik.backup", "mikrotik.interface.set"]);

export function tlsVerificationDisabled(env: NodeJS.ProcessEnv): boolean {
  return env.JARVIS_MIKROTIK_TLS_INSECURE === "1" || env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
}

export function runRouterOs(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (tlsVerificationDisabled(env)) {
    return {
      called: false,
      code: "POLICY_DENIED",
      detail: "routeros: отключение проверки TLS запрещено. Запрос не отправлялся.",
    };
  }
  if (CHANGE_RUNBOOKS.has(call.runbook) && env.JARVIS_MIKROTIK_CHANGE_ENABLED !== "1") {
    return {
      called: false,
      code: "ADAPTER_DISABLED",
      detail: "routeros: изменяющие REST-вызовы выключены (JARVIS_MIKROTIK_CHANGE_ENABLED не равен 1). Соединение не открывалось.",
    };
  }
  if (call.runbook === "mikrotik.interface.set") {
    const name = call.parameters?.name ?? "";
    const disabled = call.parameters?.disabled ?? "";
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name) || (disabled !== "true" && disabled !== "false")) {
      return { called: false, code: "NOT_CONFIGURED", detail: "routeros: имя интерфейса или флаг disabled не прошли серверную проверку." };
    }
  }
  const mode = {
    "mikrotik.status": "status",
    "mikrotik.interfaces": "interfaces",
    "mikrotik.routes": "routes",
    "mikrotik.dhcp": "dhcp",
    "mikrotik.wireguard": "wireguard",
    "wireguard.status": "wireguard",
    "mikrotik.firewall.counters": "firewall-counters",
    "mikrotik.wan.status": "wan-status",
    "mikrotik.logs": "logs",
    "mikrotik.backup": "backup",
    "mikrotik.interface.set": "interface-set",
  }[call.runbook] ?? "";
  if (!mode) return { called: false, code: "NOT_CONFIGURED", detail: "routeros: для runbook нет фиксированного read-only REST запроса." };
  // Read-only runbooks go through MikroMCP first when it is configured; any
  // MikroMCP failure falls back to the fixed REST client below.
  let fallbackNote = "";
  if (!CHANGE_RUNBOOKS.has(call.runbook)) {
    const viaMcp = runMikroMcp(call, env);
    if (!("fallback" in viaMcp)) return viaMcp;
    if (viaMcp.fallback !== "not configured" && viaMcp.fallback !== "no read-only mapping") fallbackNote = ` (MikroMCP недоступен: ${viaMcp.fallback}; ответ через REST)`;
  }
  if (!env.JARVIS_MIKROTIK_HOST?.trim()) return { called: false, code: "NOT_CONFIGURED", detail: "routeros: JARVIS_MIKROTIK_HOST не задан." + fallbackNote };
  if (!env.JARVIS_MIKROTIK_USER?.trim() || !env.JARVIS_MIKROTIK_PASSWORD) {
    return { called: false, code: "CREDENTIAL_UNAVAILABLE", detail: "routeros: user/password не настроены." };
  }
  const timeout = timeoutMs(env.JARVIS_ROUTEROS_TIMEOUT_MS);
  const started = Date.now();
  const run = spawnSync(process.execPath, [script, mode], {
    encoding: "utf8",
    timeout: timeout + ROUTEROS_PROCESS_MARGIN_MS,
    env: {
      ...process.env,
      ...env,
      JARVIS_ROUTEROS_TIMEOUT_MS: String(timeout),
      JARVIS_MIKROTIK_INTERFACE: call.parameters?.name ?? "",
      JARVIS_MIKROTIK_DISABLED: call.parameters?.disabled ?? "",
    },
  });
  const result = restResult(run, fallbackNote);
  if (!CHANGE_RUNBOOKS.has(call.runbook)) auditRouterCall(env, call, "routeros-rest", mode, result.code, Date.now() - started, result.code === "OK" ? "" : result.detail);
  return result;
}

function restResult(run: ReturnType<typeof spawnSync>, fallbackNote: string): ExecResult {
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ETIMEDOUT") return { called: false, code: "EXECUTION_TIMEOUT", detail: "routeros: REST probe превысил timeout." + fallbackNote };
  const stdout = String(run.stdout ?? "");
  if (run.error || !stdout.trim()) return { called: false, code: "ADAPTER_DISABLED", detail: "routeros: REST client не запустился." };
  try {
    const body = JSON.parse(stdout) as { code?: string; detail?: string };
    const code = body.code || "VERIFICATION_FAILED";
    return { called: code === "OK", code, detail: `routeros: ${body.detail ?? "нет ответа"}${fallbackNote}` };
  } catch {
    return { called: false, code: "VERIFICATION_FAILED", detail: "routeros: ответ клиента не разобран." };
  }
}
