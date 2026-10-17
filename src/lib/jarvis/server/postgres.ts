import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecResult } from "./pipeline.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_postgres.mjs");

function timeoutMs(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export type PostgresMode = "health" | "sessions" | "locks" | "size" | "status";

export function runPostgres(mode: PostgresMode, database: string, env: NodeJS.ProcessEnv = process.env): ExecResult {
  const requestTimeout = timeoutMs(env.JARVIS_POSTGRES_TIMEOUT_MS, 15_000, 1_000, 120_000);
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
      detail: `postgres: ${mode} превысил лимит ${requestTimeout} мс.`,
    };
  }
  if (run.error || !run.stdout?.trim()) {
    return { called: false, code: "ADAPTER_DISABLED", detail: "postgres: клиент не запустился." };
  }
  try {
    const body = JSON.parse(run.stdout) as { code?: string; detail?: string };
    const code = body.code || "VERIFICATION_FAILED";
    return { called: code === "OK", code, detail: `postgres: ${body.detail ?? "нет ответа"}` };
  } catch {
    return { called: false, code: "VERIFICATION_FAILED", detail: "postgres: ответ клиента не разобран." };
  }
}
