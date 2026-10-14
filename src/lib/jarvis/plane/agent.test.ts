import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { callJsonModel, type FetchLike } from "./llm-client.ts";
import { containsLlmSecret, sanitizeLlmText } from "./llm-safety.ts";
import { validateAgentPlan, type AgentPlanResult } from "./agent-planner.ts";
import { runAgentTurn, type AgentTurnResult } from "./agent-runtime.ts";
import { deterministicFirst, runHybridTurn } from "./hybrid.ts";
import { processRegisteredReadOnlyTool, type RegisteredToolResult } from "../server/pipeline.ts";
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
        user: "diagnose password=super-secret-value",
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
    assert.equal(seenBody.includes("super-secret-value"), false);
    assert.equal(seenBody.includes("[REDACTED]"), true);
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

describe("LLM prompt safety", () => {
  it("redacts common credentials and private keys locally", () => {
    const value = [
      "password=hunter2-secret",
      "Authorization: Bearer abcdefghijklmnop",
      ["sk", "proj", "abcdefghijklmnop"].join("-"),
      ["-----BEGIN TEST PRIVATE", " KEY-----"].join(""),
      "private-material",
      ["-----END TEST PRIVATE", " KEY-----"].join(""),
    ].join("\n");
    const safe = sanitizeLlmText(value);
    assert.equal(safe.redacted, true);
    assert.equal(safe.matches >= 4, true);
    assert.equal(safe.text.includes("hunter2-secret"), false);
    assert.equal(safe.text.includes("abcdefghijklmnop"), false);
    assert.equal(safe.text.includes("private-material"), false);
    assert.equal(containsLlmSecret("plain infrastructure request"), false);
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

describe("hybrid assistant routing", () => {
  it("keeps known dangerous commands in the deterministic pipeline", async () => {
    let agentCalls = 0;
    const agent = async (): Promise<AgentTurnResult> => {
      agentCalls += 1;
      return {
        code: "OK",
        answer: "must not be called",
        plan: null,
        observations: [],
        provider: null,
        model: null,
      };
    };
    const result = await runHybridTurn("Удали базу utp", {
      session,
      stateDir: dir(),
      requestId: "hybrid-drop",
      mode: "dry-run",
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      agent,
    });
    assert.equal(agentCalls, 0);
    assert.equal(result.kind, "command");
    assert.equal(result.code, "POLICY_DENIED");
  });

  it("routes unknown natural-language diagnostics to the AI runtime", async () => {
    let agentCalls = 0;
    const agent = async (): Promise<AgentTurnResult> => {
      agentCalls += 1;
      return {
        code: "OK",
        answer: "diagnostic answer",
        plan: {
          objective: "Diagnose",
          responseMode: "answer",
          message: "diagnostic answer",
          steps: [],
        },
        observations: [],
        provider: "openai",
        model: "gpt-test",
      };
    };
    const text = "Разберись, почему всё стало медленнее после обеда";
    assert.equal(deterministicFirst(text), false);
    const result = await runHybridTurn(text, {
      session,
      stateDir: dir(),
      requestId: "hybrid-natural",
      mode: "dry-run",
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      agent,
    });
    assert.equal(agentCalls, 1);
    assert.equal(result.kind, "agent");
    assert.equal(result.code, "OK");
  });

  it("keeps short confirmations in the deterministic pipeline", () => {
    assert.equal(deterministicFirst("да"), true);
    assert.equal(deterministicFirst("Выполнить(\"опасно\")"), true);
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

  it("routes a mutating plan through audited server admission without execution", async () => {
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
      return {
        code: "MUTATION_REQUIRES_APPROVAL",
        verdict: "deny",
        mode: "real",
        requestId: "agent-mutation",
        auditId: "audit-mutation",
        runbook: "sql.backup",
        target: "utp",
        executionCalled: false,
        detail: "mutation blocked",
        verification: "BACKUP CHECKSUM",
      };
    };

    const result = await runAgentTurn("Сделай backup utp", {
      session,
      stateDir: dir(),
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      planner,
      toolRunner,
    });

    assert.equal(calls, 1);
    assert.equal(result.code, "MUTATION_REQUIRES_APPROVAL");
    assert.equal(result.observations[0].executionCalled, false);
  });

  it("server admission never invokes executor for a mutating registered runbook", () => {
    const root = dir();
    let executorCalls = 0;
    const result = processRegisteredReadOnlyTool({
      runbook: "sql.backup",
      target: "utp",
      requestId: "agent-direct-mutation",
      session,
      stateDir: root,
      mode: "real",
      execute: () => {
        executorCalls += 1;
        return { called: true, code: "OK", detail: "must never happen" };
      },
    });
    assert.equal(executorCalls, 0);
    assert.equal(result.code, "MUTATION_REQUIRES_APPROVAL");
    assert.equal(result.executionCalled, false);
    assert.equal(result.auditId.length > 0, true);
  });

});


it("rejects expired agent sessions before calling the model or any tool", async () => {
  let called = false;
  const result = await runAgentTurn("diagnose", {
    session: { ...session, expiresAt: 1 },
    stateDir: dir(),
    env: { JARVIS_AI_AGENT_ENABLED: "1" },
    planner: async () => {
      called = true;
      throw new Error("expired session reached planner");
    },
  });
  assert.equal(result.code, "AUTH_REQUIRED");
  assert.equal(called, false);
});
