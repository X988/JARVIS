import { z } from "zod";
import { adapterStatus } from "./adapters.ts";

const DEPRECATED: Record<string, string> = {
  JARVIS_MAILCOW_COMPOSE_FILE: "JARVIS_MAILCOW_COMPOSE",
  JARVIS_AUDIT_HTTP: "JARVIS_AUDIT_HTTP_URL",
  JARVIS_SQL_BACKUP_DESTINATION: "JARVIS_SQL_BACKUP_DIR",
  JARVIS_TELEGRAM_IDS: "JARVIS_TELEGRAM_ACTORS_JSON",
};

const ENABLED_NEEDS_HOST: Array<[string, string]> = [
  ["JARVIS_SSH_ENABLED", "JARVIS_SSH_HOST"],
  ["JARVIS_POWERSHELL_ENABLED", "JARVIS_WINDOWS_HOST"],
  ["JARVIS_SQL_ENABLED", "JARVIS_SQL_HOST"],
  ["JARVIS_ROUTEROS_ENABLED", "JARVIS_MIKROTIK_HOST"],
  ["JARVIS_DOCKER_ENABLED", "JARVIS_DOCKER_HOST"],
];

const actorSchema = z.object({
  actorId: z.string().min(1),
  role: z.enum(["operator", "none"]),
});

export type JarvisProblems = string[];

function enabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function configProblems(env: NodeJS.ProcessEnv = process.env): JarvisProblems {
  const problems: string[] = [];
  for (const [oldName, nextName] of Object.entries(DEPRECATED)) {
    if (env[oldName]?.trim()) problems.push(`${oldName} устарело. Задайте ${nextName}. Старое имя не читается.`);
  }
  for (const [flag, host] of ENABLED_NEEDS_HOST) {
    if (enabled(env[flag]) && !env[host]?.trim()) problems.push(`${flag} включён, а ${host} пуст.`);
  }
  const raw = env.JARVIS_TELEGRAM_ACTORS_JSON?.trim();
  if (raw) {
    const parsed = z.record(z.string().regex(/^[1-9]\d*$/), actorSchema).safeParse(safeJson(raw));
    if (!parsed.success) problems.push("JARVIS_TELEGRAM_ACTORS_JSON не является картой числовой id → {actorId, role}.");
  }
  if (env.EXECUTION_MODE && !["mock", "dry-run", "real"].includes(env.EXECUTION_MODE)) {
    problems.push("EXECUTION_MODE должен быть mock, dry-run или real.");
  }
  const profile = env.JARVIS_PROFILE?.trim();
  if (profile && profile !== "demo" && profile !== "production-infra") {
    problems.push("JARVIS_PROFILE должен быть demo или production-infra.");
  }
  return problems;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readiness(
  env: NodeJS.ProcessEnv = process.env,
  opts: { dumpPresent?: boolean } = {},
): { ok: boolean; profile: "demo" | "production-infra"; problems: string[]; adapters: Record<string, string> } {
  const problems = configProblems(env);
  const profile = env.JARVIS_PROFILE === "production-infra" ? "production-infra" : "demo";
  const adapters = adapterStatus();
  if (profile === "demo") {
    return { ok: problems.length === 0 && opts.dumpPresent !== false, profile, problems, adapters };
  }
  const required = ["powershell", "ssh", "sql"] as const;
  const live = required.every((name) => adapters[name] === "OK");
  return { ok: problems.length === 0 && live, profile, problems, adapters };
}
