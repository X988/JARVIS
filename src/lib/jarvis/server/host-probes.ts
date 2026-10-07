import { spawnSync } from "node:child_process";
import type { ExecCall, ExecResult } from "./pipeline.ts";
import { targetById } from "./inventory.ts";

type HostMap = Record<string, string>;

function envInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseHostMap(raw: string | undefined): HostMap {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: HostMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string" && safeHost(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function safeHost(value: string): boolean {
  return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
}

function targetHost(targetId: string, kind: "windows" | "ssh", env: NodeJS.ProcessEnv): string | null {
  const target = targetById(targetId);
  if (!target) return null;
  const map = parseHostMap(kind === "windows" ? env.JARVIS_WINDOWS_TARGETS_JSON : env.JARVIS_SSH_TARGETS_JSON);
  if (map[targetId]) return map[targetId];
  if (kind === "windows" && targetId === "dc01" && safeHost(env.JARVIS_WINDOWS_HOST ?? "")) return env.JARVIS_WINDOWS_HOST!;
  if (kind === "ssh" && targetId === "mail01" && safeHost(env.JARVIS_SSH_HOST ?? "")) return env.JARVIS_SSH_HOST!;
  return null;
}

function safeUser(value: string): boolean {
  return /^[A-Za-z0-9_.@\\-]{1,128}$/.test(value);
}

function safePath(value: string): boolean {
  return value.length > 0 && !value.includes("\0") && !/[\r\n]/.test(value);
}

export function sshArgs(call: ExecCall, env: NodeJS.ProcessEnv = process.env): string[] | null {
  const host = targetHost(call.target, "ssh", env);
  const user = env.JARVIS_SSH_USER?.trim() ?? "";
  if (!host || !safeUser(user)) return null;
  const port = envInt(env.JARVIS_SSH_PORT, 22, 1, 65535);
  const timeout = Math.max(1, Math.ceil(envInt(env.JARVIS_SSH_TIMEOUT_MS, 15_000, 1_000, 120_000) / 1000));
  const args = [
    "-o", "BatchMode=yes",
    "-o", `ConnectTimeout=${timeout}`,
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    "-p", String(port),
  ];
  const knownHosts = env.JARVIS_SSH_KNOWN_HOSTS_FILE?.trim();
  if (knownHosts && safePath(knownHosts)) args.push("-o", `UserKnownHostsFile=${knownHosts}`);
  const key = env.JARVIS_SSH_KEY_FILE?.trim();
  if (key && safePath(key)) args.push("-i", key);
  const remote = sshCommand(call.runbook);
  args.push(`${user}@${host}`, `sh -c ${shellQuote(remote)}`);
  return args;
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\\"'\\\"'") + "'";
}

function sshCommand(runbook: string): string {
  if (runbook === "disk.check") {
    return "LC_ALL=C df -P -x tmpfs -x devtmpfs 2>/dev/null";
  }
  return [
    "set -eu",
    "printf 'HOST='; hostname",
    "awk '{print \"UPTIME=\"$1}' /proc/uptime",
    "awk '/MemTotal:/{t=$2}/MemAvailable:/{a=$2}END{print \"MEM_TOTAL_KB=\"t; print \"MEM_AVAILABLE_KB=\"a}' /proc/meminfo",
    "LC_ALL=C df -P -x tmpfs -x devtmpfs 2>/dev/null",
    "(systemctl --failed --no-legend --plain 2>/dev/null || true) | wc -l | awk '{print \"FAILED_SERVICES=\"$1}'",
  ].join("; ");
}

function summarizeSsh(runbook: string, stdout: string): string | null {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (runbook === "disk.check") {
    if (lines.length < 2) return null;
    const rows = lines.slice(1);
    let worst = 0;
    for (const line of rows) {
      const hit = line.match(/\s(\d+)%\s/);
      if (hit) worst = Math.max(worst, Number(hit[1]));
    }
    return `filesystems=${rows.length}; worst_used_pct=${worst}`;
  }
  const get = (name: string) => lines.find((line) => line.startsWith(name + "="))?.slice(name.length + 1) ?? "";
  const host = get("HOST");
  const uptime = get("UPTIME");
  const total = get("MEM_TOTAL_KB");
  const available = get("MEM_AVAILABLE_KB");
  const failed = get("FAILED_SERVICES");
  const disks = lines.filter((line) => /^\S+\s+\d+\s+\d+\s+\d+\s+\d+%\s+/.test(line)).length;
  if (!host || !uptime || !total || !available) return null;
  return `host=${host}; uptime_s=${uptime}; mem_available_kb=${available}/${total}; disks=${disks}; failed_services=${failed || "unknown"}`;
}

export function runSshProbe(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (call.runbook !== "server.health" && call.runbook !== "disk.check") {
    return { called: false, code: "NOT_CONFIGURED", detail: "ssh: для runbook нет фиксированного read-only probe." };
  }
  const args = sshArgs(call, env);
  if (!args) {
    const target = targetHost(call.target, "ssh", env);
    return {
      called: false,
      code: target ? "CREDENTIAL_UNAVAILABLE" : "NOT_CONFIGURED",
      detail: target ? "ssh: JARVIS_SSH_USER не задан или некорректен." : "ssh: адрес цели не задан в JARVIS_SSH_TARGETS_JSON.",
    };
  }
  const timeout = envInt(env.JARVIS_SSH_TIMEOUT_MS, 15_000, 1_000, 120_000);
  const executable = env.JARVIS_SSH_BIN?.trim() || "ssh";
  const run = spawnSync(executable, args, { encoding: "utf8", timeout });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") return { called: false, code: "ADAPTER_DISABLED", detail: "ssh: клиент ssh не установлен." };
  if (error?.code === "ETIMEDOUT") return { called: false, code: "EXECUTION_TIMEOUT", detail: "ssh: read-only probe превысил timeout." };
  if (run.status !== 0) return { called: false, code: "CONNECT_FAILED", detail: "ssh: соединение или read-only probe завершились ошибкой." };
  const detail = summarizeSsh(call.runbook, run.stdout ?? "");
  if (!detail) return { called: true, code: "VERIFICATION_FAILED", detail: "ssh: ответ получен, но не прошёл структурную проверку." };
  return { called: true, code: "OK", detail: `ssh: ${detail}` };
}

export function windowsTargetHost(targetId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return targetHost(targetId, "windows", env);
}

export function powershellScript(): string {
  return String.raw`
$ErrorActionPreference = 'Stop'
$target = $env:JARVIS_WINDOWS_TARGET_HOST
$user = $env:JARVIS_WINDOWS_USER
$password = $env:JARVIS_WINDOWS_PASSWORD
if ([string]::IsNullOrWhiteSpace($target) -or [string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrWhiteSpace($password)) {
  throw 'missing winrm configuration'
}
$secure = ConvertTo-SecureString $password -AsPlainText -Force
$credential = [pscredential]::new($user, $secure)
$params = @{
  ComputerName = $target
  Credential = $credential
  ErrorAction = 'Stop'
}
if ($env:JARVIS_WINDOWS_USE_SSL -ne '0') { $params.UseSSL = $true }
if ($env:JARVIS_WINDOWS_PORT) { $params.Port = [int]$env:JARVIS_WINDOWS_PORT }
$mode = $env:JARVIS_WINDOWS_PROBE_MODE
$result = Invoke-Command @params -ScriptBlock {
  param($mode)
  if ($mode -eq 'disk') {
    [ordered]@{
      host = $env:COMPUTERNAME
      disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        [ordered]@{ device = $_.DeviceID; size = [int64]$_.Size; free = [int64]$_.FreeSpace }
      })
    } | ConvertTo-Json -Compress -Depth 5
    return
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
  $failed = @(Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } | Select-Object -First 20 Name,State,StartMode)
  [ordered]@{
    host = $env:COMPUTERNAME
    uptimeSec = [int64]((Get-Date) - $os.LastBootUpTime).TotalSeconds
    cpuLoadPct = [double]($cpu.Average ?? 0)
    memoryTotalKb = [int64]$os.TotalVisibleMemorySize
    memoryFreeKb = [int64]$os.FreePhysicalMemory
    disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
      [ordered]@{ device = $_.DeviceID; size = [int64]$_.Size; free = [int64]$_.FreeSpace }
    })
    failedAutoServices = $failed
  } | ConvertTo-Json -Compress -Depth 6
} -ArgumentList $mode
$result
`;
}

function summarizeWindows(runbook: string, stdout: string): string | null {
  try {
    const body = JSON.parse(stdout.trim()) as {
      host?: string;
      uptimeSec?: number;
      cpuLoadPct?: number;
      memoryTotalKb?: number;
      memoryFreeKb?: number;
      disks?: Array<{ device?: string; size?: number; free?: number }>;
      failedAutoServices?: unknown[];
    };
    if (!body.host || !Array.isArray(body.disks)) return null;
    if (runbook === "disk.check") {
      const worst = body.disks.reduce((current, disk) => {
        if (!disk.size || disk.size <= 0 || typeof disk.free !== "number") return current;
        return Math.max(current, Math.round(((disk.size - disk.free) / disk.size) * 100));
      }, 0);
      return `host=${body.host}; disks=${body.disks.length}; worst_used_pct=${worst}`;
    }
    if (typeof body.uptimeSec !== "number" || typeof body.memoryTotalKb !== "number" || typeof body.memoryFreeKb !== "number") return null;
    return `host=${body.host}; uptime_s=${body.uptimeSec}; cpu_pct=${body.cpuLoadPct ?? 0}; mem_free_kb=${body.memoryFreeKb}/${body.memoryTotalKb}; disks=${body.disks.length}; failed_auto_services=${body.failedAutoServices?.length ?? 0}`;
  } catch {
    return null;
  }
}

export function runWindowsProbe(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (call.runbook !== "server.health" && call.runbook !== "disk.check") {
    return { called: false, code: "NOT_CONFIGURED", detail: "powershell: для runbook нет фиксированного read-only probe." };
  }
  const host = targetHost(call.target, "windows", env);
  if (!host) return { called: false, code: "NOT_CONFIGURED", detail: "powershell: адрес цели не задан в JARVIS_WINDOWS_TARGETS_JSON." };
  const user = env.JARVIS_WINDOWS_USER?.trim() ?? "";
  const password = env.JARVIS_WINDOWS_PASSWORD ?? "";
  if (!safeUser(user) || !password) {
    return { called: false, code: "CREDENTIAL_UNAVAILABLE", detail: "powershell: user/password не настроены." };
  }
  const executable = env.JARVIS_PWSH_BIN?.trim() || "pwsh";
  const timeout = envInt(env.JARVIS_WINDOWS_TIMEOUT_MS, 30_000, 2_000, 120_000);
  const childEnv = {
    ...process.env,
    ...env,
    JARVIS_WINDOWS_TARGET_HOST: host,
    JARVIS_WINDOWS_PROBE_MODE: call.runbook === "disk.check" ? "disk" : "health",
  };
  const run = spawnSync(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], {
    encoding: "utf8",
    timeout,
    input: powershellScript(),
    env: childEnv,
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ENOENT") return { called: false, code: "ADAPTER_DISABLED", detail: "powershell: pwsh не установлен." };
  if (error?.code === "ETIMEDOUT") return { called: false, code: "EXECUTION_TIMEOUT", detail: "powershell: WinRM probe превысил timeout." };
  if (run.status !== 0) return { called: false, code: "CONNECT_FAILED", detail: "powershell: WinRM не выполнил read-only probe." };
  const detail = summarizeWindows(call.runbook, run.stdout ?? "");
  if (!detail) return { called: true, code: "VERIFICATION_FAILED", detail: "powershell: ответ получен, но не прошёл структурную проверку." };
  return { called: true, code: "OK", detail: `powershell: ${detail}` };
}
