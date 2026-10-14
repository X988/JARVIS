import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetById } from "./inventory.ts";
import type { ExecCall, ExecResult } from "./pipeline.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_github.mjs");

export function runGithubCi(call: ExecCall, env: NodeJS.ProcessEnv = process.env): ExecResult {
  if (call.runbook !== "github.ci") {
    return { called: false, code: "NOT_CONFIGURED", detail: "github: no fixed read-only adapter for runbook" };
  }
  const target = targetById(call.target);
  const repo = target?.type === "repo" && target.roles.includes("github-repository") ? target.reference : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return { called: false, code: "NOT_CONFIGURED", detail: "github: repository is not mapped by inventory" };
  }
  if (!env.JARVIS_GITHUB_TOKEN?.trim()) {
    return { called: false, code: "CREDENTIAL_UNAVAILABLE", detail: "github: JARVIS_GITHUB_TOKEN is not configured" };
  }
  const run = spawnSync(process.execPath, [script, repo], {
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, ...env },
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ETIMEDOUT") {
    return { called: false, code: "EXECUTION_TIMEOUT", detail: "github: read-only API probe timed out" };
  }
  if (run.error || !run.stdout?.trim()) {
    return { called: false, code: "ADAPTER_DISABLED", detail: "github: adapter client did not start" };
  }
  try {
    const body = JSON.parse(run.stdout) as { code?: string; detail?: string };
    const code = body.code || "VERIFICATION_FAILED";
    return { called: code === "OK", code, detail: `github: ${body.detail ?? "no response"}` };
  } catch {
    return { called: false, code: "VERIFICATION_FAILED", detail: "github: adapter response was invalid" };
  }
}
