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

/** Real and production contours must not learn unknown host keys. */
export function sshKnownHostsRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.EXECUTION_MODE === "real" ||
    env.JARVIS_PROFILE === "production-infra" ||
    env.JARVIS_SSH_REQUIRE_KNOWN_HOSTS === "1"
  );
}

export function sshArgs(call: ExecCall, env: NodeJS.ProcessEnv = process.env): string[] | null {
  const host = targetHost(call.target, "ssh", env);
  const user = env.JARVIS_SSH_USER?.trim() ?? "";
  if (!host || !safeUser(user)) return null;
  const knownHosts = env.JARVIS_SSH_KNOWN_HOSTS_FILE?.trim() ?? "";
  const key = env.JARVIS_SSH_KEY_FILE?.trim() ?? "";
  if (sshKnownHostsRequired(env) && (!knownHosts || !safePath(knownHosts) || !key || !safePath(key))) return null;
  const port = envInt(env.JARVIS_SSH_PORT, 22, 1, 65535);
  const timeout = Math.max(1, Math.ceil(envInt(env.JARVIS_SSH_TIMEOUT_MS, 15_000, 1_000, 120_000) / 1000));
  const args = [
    "-o", "BatchMode=yes",
    "-o", `ConnectTimeout=${timeout}`,
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UpdateHostKeys=no",
    "-p", String(port),
  ];
  if (knownHosts && safePath(knownHosts)) args.push("-o", `UserKnownHostsFile=${knownHosts}`);
  if (key && safePath(key)) {
    args.push("-o", "IdentitiesOnly=yes", "-i", key);
  }
  const remote = sshCommand(call.runbook);
  if (!remote) return null;
  args.push(`${user}@${host}`, `sh -c ${shellQuote(remote)}`);
  return args;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const SSH_COMMANDS: Record<string, string> = {
  "disk.check": "LC_ALL=C df -P -x tmpfs -x devtmpfs 2>/dev/null",
  "linux.filesystem": "LC_ALL=C df -P -x tmpfs -x devtmpfs 2>/dev/null",
  "server.health": [
    "set -eu",
    "printf 'HOST='; hostname",
    "awk '{print \"UPTIME=\"$1}' /proc/uptime",
    "awk '/MemTotal:/{t=$2}/MemAvailable:/{a=$2}END{print \"MEM_TOTAL_KB=\"t; print \"MEM_AVAILABLE_KB=\"a}' /proc/meminfo",
    "LC_ALL=C df -P -x tmpfs -x devtmpfs 2>/dev/null",
    "(systemctl --failed --no-legend --plain 2>/dev/null || true) | wc -l | awk '{print \"FAILED_SERVICES=\"$1}'",
  ].join("; "),
  "linux.systemd": "systemctl --failed --no-legend --plain 2>/dev/null | head -n 30; printf '\\nRUNNING='; systemctl is-system-running 2>/dev/null || true",
  "linux.docker": "docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | head -n 40",
  "linux.postgres": "pg_isready; printf '\\n'; ps -eo comm | awk 'BEGIN{c=0} $0==\"postgres\"{c++} END{print \"POSTGRES_PROCS=\" c}'",
  "linux.http": "if command -v ss >/dev/null 2>&1; then ss -lnt | head -n 20; else netstat -lnt 2>/dev/null | head -n 20; fi",
};

function sshCommand(runbook: string): string | null {
  return SSH_COMMANDS[runbook] ?? null;
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

function summarizeGeneric(stdout: string): string | null {
  const lines = stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\p{L}\p{N} ._:=/+-]/gu, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return null;
  return lines.join(" | ").slice(0, 500);
}

export function runSshProbe(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (!sshCommand(call.runbook)) {
    return { called: false, code: "NOT_CONFIGURED", detail: "ssh: для runbook нет фиксированного read-only probe." };
  }
  const args = sshArgs(call, env);
  if (!args) {
    const target = targetHost(call.target, "ssh", env);
    if (target && sshKnownHostsRequired(env)) {
      return {
        called: false,
        code: "NOT_CONFIGURED",
        detail: "ssh: production/real требует заранее проверенный JARVIS_SSH_KNOWN_HOSTS_FILE и ключ JARVIS_SSH_KEY_FILE. Соединение не открывалось.",
      };
    }
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
  const stdout = run.stdout ?? "";
  const detail =
    call.runbook === "server.health" || call.runbook === "disk.check" || call.runbook === "linux.filesystem"
      ? summarizeSsh(call.runbook === "linux.filesystem" ? "disk.check" : call.runbook, stdout)
      : summarizeGeneric(stdout);
  if (!detail) return { called: true, code: "VERIFICATION_FAILED", detail: "ssh: ответ получен, но не прошёл структурную проверку." };
  return { called: true, code: "OK", detail: `ssh: ${detail}` };
}

export function windowsTargetHost(targetId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return targetHost(targetId, "windows", env);
}

const WINDOWS_MODES: Record<string, string> = {
  "server.health": "health",
  "disk.check": "disk",
  "windows.reachability": "reachability",
  "windows.services": "services",
  "windows.events": "events",
  "windows.dns": "dns",
  "windows.memory": "memory",
  "windows.time": "time",
  "windows.tasks": "tasks",
  "ad.replication": "ad-replication",
  "ad.accounts": "ad-accounts",
};

function safeProbeToken(value: string | undefined, pattern: RegExp): string {
  const clean = value?.trim() ?? "";
  return pattern.test(clean) ? clean : "";
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
$dnsName = $env:JARVIS_WINDOWS_DNS_NAME
$groupName = $env:JARVIS_WINDOWS_AD_GROUP
$result = Invoke-Command @params -ScriptBlock {
  param($mode, $dnsName, $groupName)
  if ($mode -eq 'disk') {
    [ordered]@{
      host = $env:COMPUTERNAME
      disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        [ordered]@{ device = $_.DeviceID; size = [int64]$_.Size; free = [int64]$_.FreeSpace }
      })
    } | ConvertTo-Json -Compress -Depth 5
    return
  }
  if ($mode -eq 'reachability') {
    [ordered]@{ summary = "host=$($env:COMPUTERNAME)" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'services') {
    $names = @('NTDS','DNS','W32Time','Schedule','LanmanServer','MSSQLSERVER')
    $rows = @(Get-CimInstance Win32_Service | Where-Object { $names -contains $_.Name } | Select-Object -First 20 Name, State)
    $stopped = @($rows | Where-Object { $_.State -ne 'Running' }).Count
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); services=$($rows.Count); stopped=$stopped" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'events') {
    $rows = @(Get-WinEvent -LogName System -MaxEvents 15 -ErrorAction SilentlyContinue | Select-Object Id, Level)
    $errors = @($rows | Where-Object { $_.Level -le 2 }).Count
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); events=$($rows.Count); error_level=$errors" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'dns') {
    $svc = Get-Service DNS -ErrorAction SilentlyContinue
    $status = if ($svc) { [string]$svc.Status } else { 'absent' }
    $resolved = 'resolved=skipped'
    if ($dnsName -match '^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$') {
      try {
        $null = Resolve-DnsName -Name $dnsName -Type A -ErrorAction Stop | Select-Object -First 1
        $resolved = 'resolved=1'
      } catch {
        $resolved = 'resolved=0'
      }
    }
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); dns_service=$status; $resolved" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'memory') {
    $mem = Get-CimInstance Win32_OperatingSystem
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); mem_free_kb=$([int64]$mem.FreePhysicalMemory); mem_total_kb=$([int64]$mem.TotalVisibleMemorySize)" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'time') {
    $time = Get-Service W32Time -ErrorAction SilentlyContinue
    $timeStatus = if ($time) { [string]$time.Status } else { 'absent' }
    $utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); w32time=$timeStatus; utc=$utc" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'tasks') {
    $tasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'Ready' -and $_.State -ne 'Running' } | Select-Object -First 20 TaskName)
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); not_ready=$($tasks.Count)" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'ad-replication') {
    $failures = @(Get-ADReplicationPartnerMetadata -Target $env:COMPUTERNAME -ErrorAction Stop | Where-Object { $_.LastReplicationResult -ne 0 })
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); replication_failures=$($failures.Count)" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -eq 'ad-accounts') {
    $group = 'Domain Admins'
    if ($groupName -match '^[A-Za-z0-9 ._-]{1,64}$') { $group = $groupName }
    $members = @(Get-ADGroupMember -Identity $group -ErrorAction Stop)
    $locked = @(Get-ADUser -Filter 'LockedOut -eq $true' -ResultSetSize 50 -ErrorAction Stop)
    [ordered]@{ summary = "host=$($env:COMPUTERNAME); group_members=$($members.Count); locked_out=$($locked.Count)" } | ConvertTo-Json -Compress
    return
  }
  if ($mode -ne 'health') {
    [ordered]@{ summary = 'unsupported' } | ConvertTo-Json -Compress
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
} -ArgumentList $mode, $dnsName, $groupName
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
    if (typeof (body as { summary?: unknown }).summary === "string") {
      const summary = (body as { summary: string }).summary.trim();
      if (!summary || summary === "unsupported") return null;
      return summary.slice(0, 500);
    }
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
  const mode = WINDOWS_MODES[call.runbook];
  if (!mode) {
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
    JARVIS_WINDOWS_PROBE_MODE: mode,
    JARVIS_WINDOWS_DNS_NAME: safeProbeToken(
      env.JARVIS_WINDOWS_DNS_NAME,
      /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/,
    ),
    JARVIS_WINDOWS_AD_GROUP: safeProbeToken(env.JARVIS_WINDOWS_AD_GROUP, /^[A-Za-z0-9 ._-]{1,64}$/),
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
