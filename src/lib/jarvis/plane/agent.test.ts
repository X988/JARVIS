import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { callJsonModel, type FetchLike } from "./llm-client.ts";
import { validateAgentPlan, type AgentPlanResult } from "./agent-planner.ts";
import { runAgentTurn } from "./agent-runtime.ts";
import type { RegisteredToolResult } from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-agent-"));
}

const session: Session = {
  id: "test-session",
  accountId: "admin1",
  role: "operator",
  expiresAt: Date.now() + 60_000,
  channel: "web",
};

describe("LLM JSON gateway", () => {
  it("calls OpenAI Responses API with structured JSON and never puts the API key in the body", async () => {
    let seenUrl = "";
    let seenBody = "";
    let seenAuth = "";
    const fakeFetch: FetchLike = async (input, init) => {
      seenUrl = String(input);
      seenBody = String(init?.body ?? "");
      const headers = new Headers(init?.headers);
      seenAuth = headers.get("authorization") ?? "";
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ ok: true }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-test" } },
      );
    };

    const result = await callJsonModel(
      "intent",
      {
        system: "Return JSON.",
        user: "diagnose",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
      {
        env: {
          JARVIS_LLM_INTENT_PROVIDER: "openai",
          JARVIS_OPENAI_MODEL: "gpt-test",
          OPENAI_API_KEY: "secret-key-value",
          JARVIS_LLM_RETRY_ATTEMPTS: "1",
        },
        fetch: fakeFetch,
      },
    );

    assert.equal(result.ok, true);
    assert.equal(seenUrl, "https://api.openai.com/v1/responses");
    assert.match(seenAuth, /^Bearer /);
    assert.equal(seenBody.includes("secret-key-value"), false);
    const request = JSON.parse(seenBody) as { store?: boolean; text?: { format?: { type?: string } } };
    assert.equal(request.store, false);
    assert.equal(request.text?.format?.type, "json_schema");
    if (result.ok) {
      assert.deepEqual(result.value, { ok: true });
      assert.equal(result.requestId, "req-test");
    }
  });

  it("fails closed when the selected model is not configured", async () => {
    const result = await callJsonModel(
      "intent",
      { system: "x", user: "y", schema: { type: "object" } },
      {
        env: {
          JARVIS_LLM_INTENT_PROVIDER: "openai",
          OPENAI_API_KEY: "present",
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "MODEL_UNAVAILABLE");
  });
});

describe("AI planner admission", () => {
  it("accepts a registered read-only plan", () => {
    const result = validateAgentPlan({
      objective: "Check domain controller health",
      responseMode: "execute",
      message: "Проверяю DC.",
      steps: [{ tool: "server.health", target: "dc01", reason: "read-only health check" }],
    });
    assert.equal(result.ok, true);
  });

  it("rejects invented tools and targets before runtime", () => {
    const result = validateAgentPlan({
      objective: "Do something",
      responseMode: "execute",
      message: "",
      steps: [{ tool: "shell.anything", target: "prod-root", reason: "model invented it" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "PLAN_REJECTED");
  });
});

describe("bounded AI runtime", () => {
  it("is off unless explicitly enabled", async () => {
    const result = await runAgentTurn("Проверь DC", {
      session,
      stateDir: dir(),
      env: {},
    });
    assert.equal(result.code, "AGENT_DISABLED");
  });

  it("executes a validated read-only step through the server tool runner", async () => {
    let calls = 0;
    const planner = async (): Promise<AgentPlanResult> => ({
      ok: true,
      provider: "openai",
      model: "gpt-test",
      requestId: "req-plan",
      plan: {
        objective: "Check dc01",
        responseMode: "execute",
        message: "Проверяю.",
        steps: [{ tool: "server.health", target: "dc01", reason: "health" }],
      },
    });
    const toolRunner = (): RegisteredToolResult => {
      calls += 1;
      return {
        code: "OK",
        verdict: "allow",
        mode: "real",
        requestId: "agent-test",
        auditId: "audit-test",
        runbook: "server.health",
        target: "dc01",
        executionCalled: true,
        detail: "uptime=10d cpu=7%",
        verification: "uptime/cpu/memory/disk/service status",
      };
    };

    const result = await runAgentTurn("Проверь DC", {
      session,
      stateDir: dir(),
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      planner,
      toolRunner,
    });

    assert.equal(calls, 1);
    assert.equal(result.code, "OK");
    assert.equal(result.observations[0].tool, "server.health");
    assert.match(result.answer, /uptime=10d/);
  });

  it("never invokes the autonomous runner for a mutating plan", async () => {
    let calls = 0;
    const planner = async (): Promise<AgentPlanResult> => ({
      ok: true,
      provider: "openai",
      model: "gpt-test",
      requestId: "req-plan",
      plan: {
        objective: "Backup utp",
        responseMode: "execute",
        message: "Нужен backup.",
        steps: [{ tool: "sql.backup", target: "utp", reason: "explicit user request" }],
      },
    });
    const toolRunner = (): RegisteredToolResult => {
      calls += 1;
      throw new Error("mutating tool runner must not be called");
    };

    const result = await runAgentTurn("Сделай backup utp", {
      session,
      stateDir: dir(),
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      planner,
      toolRunner,
    });

    assert.equal(calls, 0);
    assert.equal(result.code, "MUTATION_REQUIRES_APPROVAL");
    assert.equal(result.observations[0].executionCalled, false);
  });
});
