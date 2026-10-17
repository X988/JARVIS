import { test } from "node:test";
import assert from "node:assert/strict";
import { circuitAllow, circuitFailure, circuitKey, circuitSuccess, resetCircuits } from "./llm-circuit.ts";

test("circuit opens after threshold and blocks", () => {
  resetCircuits();
  const key = circuitKey("openai", "gpt-test");
  const env = { JARVIS_LLM_CB_FAILURES: "2", JARVIS_LLM_CB_COOLDOWN_MS: "60000" } as NodeJS.ProcessEnv;
  assert.equal(circuitAllow(key, 0, env), true);
  circuitFailure(key, 0, env);
  assert.equal(circuitAllow(key, 1, env), true);
  circuitFailure(key, 1, env);
  assert.equal(circuitAllow(key, 2, env), false);
});

test("circuit closes on success", () => {
  resetCircuits();
  const key = circuitKey("ollama", "m");
  const env = { JARVIS_LLM_CB_FAILURES: "3" } as NodeJS.ProcessEnv;
  circuitFailure(key, 0, env);
  circuitSuccess(key);
  assert.equal(circuitAllow(key, 1, env), true);
});
