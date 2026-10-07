import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetById } from "./inventory.ts";
import type { ExecResult } from "./pipeline.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_sql.mjs");

export function sqlDatabase(targetId: string): string | null {
  const target = targetById(targetId);
  const leaf = target?.reference.split("/").pop() ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(leaf)) return null;
  return leaf;
}

export function runSql(mode: "health" | "backup", database: string, env: NodeJS.ProcessEnv = process.env): ExecResult {
  const run = spawnSync(process.execPath, [script, mode, database], {
    encoding: "utf8",
    timeout: 12_000,
    env: { ...process.env, ...env },
  });
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
