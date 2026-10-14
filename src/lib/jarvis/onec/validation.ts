import { spawnSync } from "node:child_process";
import path from "node:path";
import { checkBsl } from "./bsl.ts";

export type OnecValidationLevel =
  | "FALLBACK_ONLY"
  | "BSL_LANGUAGE_SERVER"
  | "DESIGNER_CHECK"
  | "TEST_DATABASE_VERIFIED";

export type OnecValidationEvidence = {
  level: OnecValidationLevel;
  provider: "fallback" | "bsl-language-server" | "designer" | "edt" | "test-database";
  ok: boolean;
  detail: string;
};

export type OnecValidationResult = {
  ok: boolean;
  level: OnecValidationLevel;
  evidence: OnecValidationEvidence[];
};

export type ValidationRunner = (
  executable: string,
  args: string[],
  timeoutMs: number,
) => { status: number | null; error?: NodeJS.ErrnoException };

function runLocal(executable: string, args: string[], timeoutMs: number) {
  const run = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  return { status: run.status, error: run.error as NodeJS.ErrnoException | undefined };
}

function safeExecutable(value: string | undefined): string | null {
  const clean = value?.trim();
  if (!clean || /[\r\n\0]/.test(clean)) return null;
  if (/\s/.test(clean) && !path.isAbsolute(clean)) return null;
  return clean;
}

function timeout(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.JARVIS_ONEC_VALIDATION_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(raw) ? Math.max(5_000, Math.min(600_000, Math.trunc(raw))) : 120_000;
}

function inside(root: string, target: string): boolean {
  const base = path.resolve(root);
  const full = path.resolve(target);
  return full === base || full.startsWith(base + path.sep);
}

function runAdapter(
  executable: string,
  args: string[],
  level: OnecValidationLevel,
  provider: OnecValidationEvidence["provider"],
  runner: ValidationRunner,
  timeoutMs: number,
): OnecValidationEvidence {
  const result = runner(executable, args, timeoutMs);
  if (result.error?.code === "ENOENT") {
    return { level, provider, ok: false, detail: "configured validator executable не найден" };
  }
  return {
    level,
    provider,
    ok: result.status === 0,
    detail: result.status === 0 ? "external validation passed" : "external validation failed",
  };
}

/**
 * External commands are explicit wrappers, not arbitrary shell snippets.
 * Contract:
 * - BSL wrapper receives: <module-file>
 * - Designer/EDT wrapper receives: <export-root>
 * - test database wrapper receives: <export-root>
 * Exit 0 means that validator really completed successfully.
 */
export function validateOnecExport(
  root: string,
  moduleFile: string,
  source: string,
  env: NodeJS.ProcessEnv = process.env,
  runner: ValidationRunner = runLocal,
): OnecValidationResult {
  const base = path.resolve(root);
  const file = path.resolve(moduleFile);
  if (!inside(base, file)) {
    return {
      ok: false,
      level: "FALLBACK_ONLY",
      evidence: [{ level: "FALLBACK_ONLY", provider: "fallback", ok: false, detail: "module path outside export jail" }],
    };
  }

  const fallback = checkBsl(source);
  const evidence: OnecValidationEvidence[] = [
    {
      level: "FALLBACK_ONLY",
      provider: "fallback",
      ok: fallback.ok,
      detail: fallback.ok ? "built-in static checks passed" : fallback.hits.map((hit) => hit.message).join(" "),
    },
  ];
  if (!fallback.ok) return { ok: false, level: "FALLBACK_ONLY", evidence };

  let level: OnecValidationLevel = "FALLBACK_ONLY";
  const timeoutMs = timeout(env);

  const bsl = safeExecutable(env.JARVIS_BSL_LS_CHECK_BIN);
  if (bsl) {
    const hit = runAdapter(bsl, [file], "BSL_LANGUAGE_SERVER", "bsl-language-server", runner, timeoutMs);
    evidence.push(hit);
    if (!hit.ok) return { ok: false, level: "BSL_LANGUAGE_SERVER", evidence };
    level = "BSL_LANGUAGE_SERVER";
  }

  const designer = safeExecutable(env.JARVIS_1CV8_DESIGNER_CHECK_BIN);
  const edt = safeExecutable(env.JARVIS_EDT_CHECK_BIN);
  const structural = designer || edt;
  if (structural) {
    const provider = designer ? "designer" as const : "edt" as const;
    const hit = runAdapter(structural!, [base], "DESIGNER_CHECK", provider, runner, timeoutMs);
    evidence.push(hit);
    if (!hit.ok) return { ok: false, level: "DESIGNER_CHECK", evidence };
    level = "DESIGNER_CHECK";
  }

  const testDb = safeExecutable(env.JARVIS_ONEC_TEST_DB_CHECK_BIN);
  if (testDb) {
    const hit = runAdapter(testDb, [base], "TEST_DATABASE_VERIFIED", "test-database", runner, timeoutMs);
    evidence.push(hit);
    if (!hit.ok) return { ok: false, level: "TEST_DATABASE_VERIFIED", evidence };
    level = "TEST_DATABASE_VERIFIED";
  }

  return { ok: true, level, evidence };
}

export function onecValidationProbe(env: NodeJS.ProcessEnv = process.env): {
  fallback: true;
  bslLanguageServer: boolean;
  designerOrEdt: boolean;
  testDatabase: boolean;
} {
  return {
    fallback: true,
    bslLanguageServer: Boolean(safeExecutable(env.JARVIS_BSL_LS_CHECK_BIN)),
    designerOrEdt: Boolean(
      safeExecutable(env.JARVIS_1CV8_DESIGNER_CHECK_BIN) || safeExecutable(env.JARVIS_EDT_CHECK_BIN),
    ),
    testDatabase: Boolean(safeExecutable(env.JARVIS_ONEC_TEST_DB_CHECK_BIN)),
  };
}
