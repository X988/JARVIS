import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetById } from "./inventory.ts";
import type { ExecResult } from "./pipeline.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_sql.mjs");

function timeoutMs(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function sqlDatabase(targetId: string): string | null {
  const target = targetById(targetId);
  const leaf = target?.reference.split("/").pop() ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(leaf)) return null;
  return leaf;
}

export type SqlMode = "health" | "backup" | "database-size" | "sessions" | "blocking" | "backup-status";

export function runSql(mode: SqlMode, database: string, env: NodeJS.ProcessEnv = process.env): ExecResult {
  const requestTimeout =
    mode === "backup"
      ? timeoutMs(env.JARVIS_SQL_BACKUP_TIMEOUT_MS, 3_600_000, 10_000, 7_200_000)
      : timeoutMs(env.JARVIS_SQL_HEALTH_TIMEOUT_MS, 15_000, 1_000, 120_000);
  const grace = Math.min(30_000, Math.max(5_000, Math.floor(requestTimeout * 0.05)));
  const run = spawnSync(process.execPath, [script, mode, database], {
    encoding: "utf8",
    timeout: requestTimeout + grace,
    env: { ...process.env, ...env },
  });
  const spawnError = run.error as NodeJS.ErrnoException | undefined;
  if (spawnError?.code === "ETIMEDOUT") {
    return {
      called: false,
      code: "EXECUTION_TIMEOUT",
      detail: `sql: ${mode} превысил лимит ${requestTimeout} мс. Успех не подменяется.`,
    };
  }
  if (run.error || !run.stdout?.trim()) {
    return { called: false, code: "ADAPTER_DISABLED", detail: "sql: клиент не запустился. Запрос не отправлялся." };
  }
  try {
    const body = JSON.parse(run.stdout) as { code?: string; detail?: string };
    const code = body.code || "VERIFICATION_FAILED";
    return { called: code === "OK", code, detail: `sql: ${body.detail ?? "нет ответа"}` };
  } catch {
    return { called: false, code: "VERIFICATION_FAILED", detail: "sql: ответ клиента не разобран." };
  }
}
