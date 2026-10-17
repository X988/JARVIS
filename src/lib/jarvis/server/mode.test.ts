import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveExecutionMode, modeOf } from "./mode.ts";

test("effectiveExecutionMode degrades real when config problems", () => {
  const env = { EXECUTION_MODE: "real", JARVIS_POWERSHELL_ENABLED: "1" } as NodeJS.ProcessEnv;
  const r = effectiveExecutionMode(env);
  assert.equal(r.mode, "dry-run");
  assert.equal(r.degraded, true);
  assert.ok(r.reasons.length > 0);
});

test("modeOf does not raise above effective", () => {
  const env = { EXECUTION_MODE: "dry-run" } as NodeJS.ProcessEnv;
  assert.equal(modeOf("real", env), "dry-run");
  assert.equal(modeOf("mock", env), "dry-run");
  assert.equal(modeOf("dry-run", env), "dry-run");
});

test("explicit lower mode allowed", () => {
  const env = { EXECUTION_MODE: "real" } as NodeJS.ProcessEnv;
  // assume no problems in empty env
  assert.equal(modeOf("dry-run", env), "dry-run");
});
