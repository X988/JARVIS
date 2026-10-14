import { spawnSync } from "node:child_process";
import type { ExecCall, ExecResult } from "./pipeline.ts";

function safeHost(value: string): boolean {
  return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
}

function safeUser(value: string): boolean {
  return /^[A-Za-z0-9_.@\\-]{1,128}$/.test(value);
}

function safePath(value: string): boolean {
  return value.startsWith("/") && !value.includes("\0") && !/[\r\n]/.test(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function int(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function mailcowSshArgs(env: NodeJS.ProcessEnv = process.env): string[] | null {
  const host = env.JARVIS_DOCKER_HOST?.trim() ?? "";
  const user = (env.JARVIS_DOCKER_USER || env.JARVIS_SSH_USER || "").trim();
  const compose = env.JARVIS_MAILCOW_COMPOSE?.trim() ?? "";
  if (!safeHost(host) || !safeUser(user) || !safePath(compose)) return null;
  const port = int(env.JARVIS_DOCKER_SSH_PORT || env.JARVIS_SSH_PORT, 22, 1, 65535);
  const timeout = Math.max(1, Math.ceil(int(env.JARVIS_DOCKER_TIMEOUT_MS, 20_000, 2_000, 120_000) / 1000));
  const args = [
    "-o", "BatchMode=yes",
    "-o", `ConnectTimeout=${timeout}`,
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    "-p", String(port),
  ];
  const knownHosts = env.JARVIS_DOCKER_KNOWN_HOSTS_FILE || env.JARVIS_SSH_KNOWN_HOSTS_FILE;
  if (knownHosts?.trim() && !/[\r\n\0]/.test(knownHosts)) args.push("-o", `UserKnownHostsFile=${knownHosts.trim()}`);
  const key = env.JARVIS_DOCKER_SSH_KEY_FILE || env.JARVIS_SSH_KEY_FILE;
  if (key?.trim() && !/[\r\n\0]/.test(key)) args.push("-i", key.trim());
  const composeArg = shellQuote(compose);
  const remote = [
    "set -eu",
    `docker compose -f ${composeArg} ps --format json`,
    "printf '\\n__JARVIS_QUEUE__\\n'",
    `docker compose -f ${composeArg} exec -T postfix-mailcow postqueue -p 2>/dev/null | awk 'BEGIN{c=0} /^[A-F0-9][A-F0-9*!]*/{c++} END{print "QUEUE_COUNT=" c}'`,
  ].join("; ");
  args.push(`${user}@${host}`, `sh -c ${shellQuote(remote)}`);
  return args;
}

function parseServices(raw: string): Array<Record<string, unknown>> {
  const source = raw.trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  } catch {
    // Docker Compose often emits one JSON object per line.
  }
  const rows: Array<Record<string, unknown>> = [];
  for (const line of source.split(/\r?\n/)) {
    try {
      const row = JSON.parse(line) as unknown;
      if (row && typeof row === "object" && !Array.isArray(row)) rows.push(row as Record<string, unknown>);
    } catch {
      // Ignore non-JSON warnings, verification below still requires service rows.
    }
  }
  return rows;
}

function summary(stdout: string): string | null {
  const [ps, queuePart = ""] = stdout.split("__JARVIS_QUEUE__");
  const services = parseServices(ps);
  if (!services.length) return null;
  const running = services.filter((row) => String(row.State ?? row.state ?? "").toLowerCase() === "running").length;
  const unhealthy = services.filter((row) => {
    const health = String(row.Health ?? row.health ?? "").toLowerCase();
    return Boolean(health && health !== "healthy");
  }).length;
  const queue = Number(queuePart.match(/QUEUE_COUNT=(\d+)/)?.[1]);
  if (!Number.isInteger(queue) || queue < 0) return null;
  return `services=${services.length}; running=${running}; unhealthy=${unhealthy}; queue=${queue}`;
}

export function runMailcow(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (call.runbook !== "mailcow.health") {
    return { called: false, code: "NOT_CONFIGURED", detail: "docker: для runbook нет фиксированного Mailcow probe." };
  }
  const args = mailcowSshArgs(env);
  if (!args) {
    const missingCredential = Boolean(env.JARVIS_DOCKER_HOST && env.JARVIS_MAILCOW_COMPOSE);
    return {
      called: false,
      code: missingCredential ? "CREDENTIAL_UNAVAILABLE" : "NOT_CONFIGURED",
      detail: "docker: нужны host, user и абсолютный JARVIS_MAILCOW_COMPOSE.",
    };
  }
  const executable = env.JARVIS_SSH_BIN?.trim() || "ssh";
  const timeout = int(env.JARVIS_DOCKER_TIMEOUT_MS, 20_000, 2_000, 120_000);
  const run = spawnSync(executable, args, { encoding: "utf8", timeout });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") return { called: false, code: "ADAPTER_DISABLED", detail: "docker: ssh client не установлен." };
  if (error?.code === "ETIMEDOUT") return { called: false, code: "EXECUTION_TIMEOUT", detail: "docker: Mailcow probe превысил timeout." };
  if (run.status === 255) return { called: false, code: "CONNECT_FAILED", detail: "docker: SSH соединение с Mailcow не установлено." };
  if (run.status !== 0) return { called: true, code: "VERIFICATION_FAILED", detail: "docker: read-only Mailcow probe завершился ошибкой." };
  const detail = summary(run.stdout ?? "");
  if (!detail) return { called: true, code: "VERIFICATION_FAILED", detail: "docker: ответ Mailcow не прошёл структурную проверку." };
  return { called: true, code: "OK", detail: `mailcow: ${detail}` };
}
