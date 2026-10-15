import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecCall, ExecResult } from "./pipeline.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_routeros.mjs");

function timeoutMs(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 10_000;
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
    "mikrotik.resources": "resources",
    "mikrotik.vlan": "vlan",
    "mikrotik.reachability": "reachability",
    "mikrotik.backup": "backup",
    "mikrotik.interface.set": "interface-set",
  }[call.runbook] ?? "";
  if (!mode) return { called: false, code: "NOT_CONFIGURED", detail: "routeros: для runbook нет фиксированного read-only REST запроса." };
  if (!env.JARVIS_MIKROTIK_HOST?.trim()) return { called: false, code: "NOT_CONFIGURED", detail: "routeros: JARVIS_MIKROTIK_HOST не задан." };
  if (!env.JARVIS_MIKROTIK_USER?.trim() || !env.JARVIS_MIKROTIK_PASSWORD) {
    return { called: false, code: "CREDENTIAL_UNAVAILABLE", detail: "routeros: user/password не настроены." };
  }
  const timeout = timeoutMs(env.JARVIS_ROUTEROS_TIMEOUT_MS);
  const run = spawnSync(process.execPath, [script, mode], {
    encoding: "utf8",
    timeout: timeout + 5_000,
    env: {
      ...process.env,
      ...env,
      JARVIS_ROUTEROS_TIMEOUT_MS: String(timeout),
      JARVIS_MIKROTIK_INTERFACE: call.parameters?.name ?? "",
      JARVIS_MIKROTIK_DISABLED: call.parameters?.disabled ?? "",
    },
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ETIMEDOUT") return { called: false, code: "EXECUTION_TIMEOUT", detail: "routeros: REST probe превысил timeout." };
  if (run.error || !run.stdout?.trim()) return { called: false, code: "ADAPTER_DISABLED", detail: "routeros: REST client не запустился." };
  try {
    const body = JSON.parse(run.stdout) as { code?: string; detail?: string };
    const code = body.code || "VERIFICATION_FAILED";
    return { called: code === "OK", code, detail: `routeros: ${body.detail ?? "нет ответа"}` };
  } catch {
    return { called: false, code: "VERIFICATION_FAILED", detail: "routeros: ответ клиента не разобран." };
  }
}
