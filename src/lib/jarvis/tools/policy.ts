import type { Risk } from "./types.ts";

/** Tokens that never run, even if someone adds them to an allowlist. */
export const SSH_DENY_TOKENS = [
  "rm",
  "mkfs",
  "dd",
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "passwd",
  "useradd",
  "userdel",
  "usermod",
  "visudo",
  "chmod",
  "chown",
  "chgrp",
  "iptables",
  "nft",
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "bash",
  "sh",
  "zsh",
  "eval",
  "sudo",
  "su",
  "fdisk",
  "parted",
  "wipefs",
  "mkfifo",
  "kill",
  "pkill",
  "python",
  "python3",
  "perl",
  "ruby",
  "node",
  "npm",
];

export const DEFAULT_SSH_ALLOW_READ = [
  "uptime",
  "hostname",
  "who",
  "w",
  "df -h",
  "df -hP",
  "free -m",
  "uname -a",
  "cat /etc/os-release",
  "docker ps",
  "docker compose ps",
  "ip addr",
  "ip route",
  "ss -lnt",
  "systemctl status *",
  "systemctl is-active *",
];

export const DEFAULT_SSH_ALLOW_CHANGE = [
  "systemctl restart nginx",
  "systemctl restart postfix",
  "systemctl restart dovecot",
];

const META = /[;&|`$<>\\\n\r\t(){}[\]!#*?~"'"]/;

export function commandTokens(command: string): string[] | null {
  const trimmed = command.trim();
  if (!trimmed || trimmed.length > 180) return null;
  if (META.test(trimmed)) return null;
  if (/\s{2,}/.test(trimmed)) return null;
  const tokens = trimmed.split(" ");
  if (tokens.some((token) => token.length === 0)) return null;
  return tokens;
}

export function matchAllow(pattern: string, command: string): boolean {
  const cmdTokens = commandTokens(command);
  const patTokens = pattern.trim().split(" ");
  if (!cmdTokens || patTokens.length !== cmdTokens.length) return false;
  return patTokens.every((pat, index) => {
    if (pat === "*") return /^[A-Za-z0-9@._:+-]{1,64}$/.test(cmdTokens[index] ?? "");
    return pat === cmdTokens[index];
  });
}

export function assessSshCommand(
  command: string,
  risk: Risk,
  allowRead: string[],
  allowChange: string[],
  extraDeny: string[],
): { ok: true } | { ok: false; reason: string } {
  const tokens = commandTokens(command);
  if (!tokens) {
    return {
      ok: false,
      reason: "command rejected: empty, too long, or contains shell metacharacters",
    };
  }
  const denied = new Set([...SSH_DENY_TOKENS, ...extraDeny.map((item) => item.trim().toLowerCase())].filter(Boolean));
  if (tokens.some((token) => denied.has(token.toLowerCase()))) {
    return { ok: false, reason: "command rejected by denylist" };
  }
  const lower = tokens.join(" ").toLowerCase();
  for (const pattern of extraDeny) {
    const normalized = pattern.trim().toLowerCase();
    if (normalized.includes(" ") && lower.includes(normalized)) {
      return { ok: false, reason: "command rejected by denylist" };
    }
  }
  const allow = risk === "change" ? allowChange : allowRead;
  if (!allow.some((pattern) => matchAllow(pattern, command.trim()))) {
    return {
      ok: false,
      reason: risk === "change" ? "command is not on the change allowlist" : "command is not on the read allowlist",
    };
  }
  return { ok: true };
}

export function safeHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,253}$/.test(trimmed)) return null;
  if (trimmed.startsWith("-")) return null;
  return trimmed;
}

export function safeUser(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(trimmed)) return null;
  return trimmed;
}

export function safeIdentityFile(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.includes("..") || /[\n\r\0]/.test(trimmed)) return null;
  return trimmed;
}

export function safePort(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export function safeInterfaceName(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) && !value.includes("..");
}
