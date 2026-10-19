import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { callJsonModel, type FetchLike } from "./llm-client.ts";
import { circuitKey, circuitState, resetCircuits } from "./llm-circuit.ts";

const env = {
  JARVIS_LLM_INTENT_PROVIDER: "openai",
  JARVIS_OPENAI_MODEL: "gpt-circuit-test",
  OPENAI_API_KEY: "present",
  JARVIS_LLM_RETRY_ATTEMPTS: "1",
  JARVIS_LLM_CB_FAILURES: "2",
  JARVIS_LLM_CB_COOLDOWN_MS: "60000",
} as NodeJS.ProcessEnv;

const input = { system: "Return JSON.", user: "ping", schema: { type: "object" } };
const key = circuitKey("openai", "gpt-circuit-test");

function okBody(): Response {
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("callJsonModel circuit breaker", () => {
  beforeEach(() => resetCircuits());

  it("opens after repeated upstream failures and stops calling the provider", async () => {
    let calls = 0;
    const failing: FetchLike = async () => {
      calls += 1;
      return new Response("boom", { status: 500 });
    };
    const first = await callJsonModel("intent", input, { env, fetch: failing });
    const second = await callJsonModel("intent", input, { env, fetch: failing });
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    const callsBeforeOpen = calls;
    assert.equal(circuitState(key, Date.now(), env), "open");

    const blocked = await callJsonModel("intent", input, { env, fetch: failing });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "UPSTREAM_ERROR");
      assert.match(blocked.detail, /circuit breaker is open/);
    }
    assert.equal(calls, callsBeforeOpen, "an open circuit must not reach the provider");
  });

  it("a successful call keeps the circuit closed and resets failures", async () => {
    let fail = true;
    const flaky: FetchLike = async () => (fail ? new Response("boom", { status: 500 }) : okBody());
    await callJsonModel("intent", input, { env, fetch: flaky });
    fail = false;
    const ok = await callJsonModel("intent", input, { env, fetch: flaky });
    assert.equal(ok.ok, true);
    fail = true;
    await callJsonModel("intent", input, { env, fetch: flaky });
    assert.equal(circuitState(key, Date.now(), env), "closed");
  });
});
