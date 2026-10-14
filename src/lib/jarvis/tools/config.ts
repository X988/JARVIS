import { parseOperators } from "./actors.ts";
import { DEFAULT_SSH_ALLOW_CHANGE, DEFAULT_SSH_ALLOW_READ, safeHost, safeIdentityFile, safePort, safeUser } from "./policy.ts";
import type { Actor, ExecutionMode, SshHost, ToolConfig } from "./types.ts";

export function executionModeFromEnv(value: string | undefined): ExecutionMode {
  return value?.trim().toLowerCase() === "live" ? "live" : "dry-run";
}

function splitList(value: string | undefined): string[] | null {
  if (!value?.trim()) return null;
  const items = value
    .split(";;")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function envKey(alias: string): string {
  return alias.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function defaultHosts(): SshHost[] {
  return [{ alias: "mail01", host: "mail01", user: "jarvis", port: 22, identityFile: null, configured: false }];
}

function hostFromEnv(env: NodeJS.ProcessEnv, alias: string): SshHost | null {
  const key = envKey(alias);
  const host = safeHost(env[`JARVIS_SSH_${key}_HOST`]);
  const user = safeUser(env[`JARVIS_SSH_${key}_USER`]);
  if (!host || !user) return null;
  const identityFile = safeIdentityFile(env[`JARVIS_SSH_${key}_KEY`]);
  return {
    alias,
    host,
    user,
    port: safePort(env[`JARVIS_SSH_${key}_PORT`], 22),
    identityFile,
    configured: Boolean(identityFile),
  };
}

type SecretHost = { host?: string; user?: string; port?: number; identityFile?: string };
type SecretsFile = {
  ssh?: {
    hosts?: Record<string, SecretHost>;
    allowRead?: string[];
    allowChange?: string[];
    deny?: string[];
  };
  mikrotik?: {
    alias?: string;
    host?: string;
    user?: string;
    password?: string;
    port?: number;
    tlsInsecure?: boolean;
  };
  operators?: { id?: string; name?: string; role?: string; telegramId?: number }[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSecrets(text: string | null): SecretsFile | null {
  if (!text?.trim()) return null;
  try {
    const parsed = asRecord(JSON.parse(text));
    if (!parsed) return null;
    return parsed as SecretsFile;
  } catch {
    return null;
  }
}

function operatorsFromSecrets(secrets: SecretsFile | null): Actor[] | null {
  if (!secrets?.operators) return null;
  const actors: Actor[] = [];
  for (const item of secrets.operators) {
    if (!item.id || !item.name) continue;
    if (item.role !== "admin" && item.role !== "operator" && item.role !== "viewer") continue;
    actors.push({
      id: item.id,
      name: item.name,
      role: item.role,
      allowed: true,
      telegramId: typeof item.telegramId === "number" ? item.telegramId : 0,
    });
  }
  return actors.length > 0 ? actors : null;
}

function upsertHost(hosts: SshHost[], next: SshHost): SshHost[] {
  const rest = hosts.filter((host) => host.alias !== next.alias);
  return [...rest, next];
}

export function loadToolConfig(env: NodeJS.ProcessEnv, secretsText: string | null = null): ToolConfig {
  const secrets = parseSecrets(secretsText);
  let sshHosts = defaultHosts();
  const aliases = new Set<string>(["mail01"]);
  const listed = env.JARVIS_SSH_HOSTS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  for (const alias of listed) aliases.add(alias);
  for (const alias of Object.keys(secrets?.ssh?.hosts ?? {})) aliases.add(alias);

  for (const alias of aliases) {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(alias)) continue;
    const fromFile = secrets?.ssh?.hosts?.[alias];
    const fromEnv = hostFromEnv(env, alias);
    if (!fromFile && !fromEnv && alias === "mail01") continue;
    const host = safeHost(fromEnv?.host ?? fromFile?.host) ?? (alias === "mail01" ? "mail01" : null);
    const user = safeUser(fromEnv?.user ?? fromFile?.user) ?? (alias === "mail01" ? "jarvis" : null);
    if (!host || !user) continue;
    const identityFile = safeIdentityFile(fromEnv?.identityFile ?? fromFile?.identityFile);
    sshHosts = upsertHost(sshHosts, {
      alias,
      host,
      user,
      port: safePort(fromEnv?.port ?? fromFile?.port, 22),
      identityFile,
      configured: Boolean(identityFile),
    });
  }

  const mtHost = safeHost(env.JARVIS_MT_HOST ?? secrets?.mikrotik?.host) ?? "rb5009";
  const mtUser = safeUser(env.JARVIS_MT_USER ?? secrets?.mikrotik?.user) ?? "jarvis-mikrotik";
  const mtPassword = (env.JARVIS_MT_PASSWORD ?? secrets?.mikrotik?.password ?? "").trim();
  const timeout = Number(env.OLLAMA_TIMEOUT_MS ?? "1500");

  return {
    mode: executionModeFromEnv(env.EXECUTION_MODE),
    sshHosts,
    sshAllowRead: splitList(env.JARVIS_SSH_ALLOW_READ) ?? secrets?.ssh?.allowRead ?? [...DEFAULT_SSH_ALLOW_READ],
    sshAllowChange: splitList(env.JARVIS_SSH_ALLOW_CHANGE) ?? secrets?.ssh?.allowChange ?? [...DEFAULT_SSH_ALLOW_CHANGE],
    sshDeny: splitList(env.JARVIS_SSH_DENY) ?? secrets?.ssh?.deny ?? [],
    mikrotik: {
      alias: safeHost(secrets?.mikrotik?.alias) ?? "rb5009",
      host: mtHost,
      user: mtUser,
      password: mtPassword || null,
      port: safePort(env.JARVIS_MT_PORT ?? secrets?.mikrotik?.port, 443),
      tlsInsecure: (env.JARVIS_MT_TLS_INSECURE ?? String(secrets?.mikrotik?.tlsInsecure ?? "false")).toLowerCase() === "true",
      configured: Boolean(mtPassword && mtHost && mtUser),
    },
    ollamaBaseUrl: (env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: env.OLLAMA_MODEL?.trim() || "qwen3",
    ollamaTimeoutMs: Number.isFinite(timeout) && timeout >= 200 ? timeout : 1500,
    auditPath: env.JARVIS_AUDIT_PATH?.trim() || "data/audit.jsonl",
    knownHostsPath: env.JARVIS_KNOWN_HOSTS?.trim() || "data/ssh/known_hosts",
    operators: parseOperators(env.JARVIS_OPERATORS) ?? operatorsFromSecrets(secrets),
  };
}

export function publicConfig(config: ToolConfig) {
  return {
    mode: config.mode,
    ollamaModel: config.ollamaModel,
    ollamaBaseUrl: config.ollamaBaseUrl,
    sshHosts: config.sshHosts.map((host) => ({
      alias: host.alias,
      user: host.user,
      host: host.host,
      port: host.port,
      keyConfigured: host.configured,
    })),
    mikrotik: {
      alias: config.mikrotik.alias,
      host: config.mikrotik.host,
      port: config.mikrotik.port,
      configured: config.mikrotik.configured,
    },
  };
}
