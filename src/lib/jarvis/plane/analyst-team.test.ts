import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callJsonModel } from "./llm-client.ts";
import { ANALYST_ROLES, runAnalystTeam } from "./analyst-team.ts";
import type { AgentObservation } from "./agent-runtime.ts";

function observation(patch: Partial<AgentObservation> = {}): AgentObservation {
  return {
    tool: "server.health",
    target: "dc01",
    code: "OK",
    detail: "cpu=7%; uptime=10d",
    verification: "health probe",
    executionCalled: true,
    auditId: "audit-verified-1",
    ...patch,
  };
}

function makeCaller(
  hook: (job: string, call: number, user: string) => unknown,
): { complete: typeof callJsonModel; calls: () => number; requests: () => string[] } {
  let callCount = 0;
  const seen: string[] = [];
  const complete: typeof callJsonModel = async (job, input) => {
    callCount += 1;
    seen.push(input.user);
    return {
      ok: true,
      provider: "openai",
      model: "test-model",
      requestId: null,
      value: hook(job, callCount, input.user),
    };
  };
  return { complete, calls: () => callCount, requests: () => seen };
}

const note = {
  summary: "The observation reports normal CPU; root cause remains unverified.",
  evidenceIds: ["obs-1"],
  missingEvidence: ["Historical CPU and service metrics"],
};

const supportedReview = {
  ...note,
  verdict: "SUPPORTED",
  answer: "The single verified probe reports CPU at 7%. It does not establish the root cause.",
};

describe("four-role analyst team", () => {
  it("registers exactly four bounded, non-executing roles", () => {
    assert.deepEqual(ANALYST_ROLES.map((role) => role.id), [
      "coordinator", "context-manager", "root-cause-analyst", "reviewer",
    ]);
  });

  it("runs four evidence-only analyses, with the reviewer last", async () => {
    const mock = makeCaller((_job, call) => call === 4 ? supportedReview : note);
    const result = await runAnalystTeam({
      request: "Почему сервер стал медленным?",
      objective: "Investigate dc01",
      observations: [observation()],
    }, { complete: mock.complete });
    assert.equal(result.ok, true);
    assert.equal(mock.calls(), 4);
    if (result.ok) {
      assert.deepEqual(result.roles, ["coordinator", "context-manager", "root-cause-analyst", "reviewer"]);
      assert.deepEqual(result.evidenceIds, ["obs-1"]);
      assert.match(result.answer, /audit-verified-1/);
      assert.match(result.answer, /CPU at 7%/);
    }
    assert.equal(mock.requests()[3].includes("root-cause-analyst"), false);
    assert.equal(mock.requests()[3].includes("diagnosis"), true);
  });

  it("rejects mock, dry-run, unaudited and mutation evidence without model calls", async () => {
    const mock = makeCaller(() => note);
    for (const sample of [
      observation({ code: "MOCK" }),
      observation({ code: "DRY_RUN", executionCalled: false }),
      observation({ code: "MUTATION_REQUIRES_APPROVAL", executionCalled: false }),
      observation({ auditId: null }),
      observation({ executionCalled: false }),
    ]) {
      const result = await runAnalystTeam({ request: "diagnose", objective: "health", observations: [sample] }, { complete: mock.complete });
      assert.deepEqual(result.ok, false);
      if (!result.ok) assert.equal(result.code, "TEAM_UNSUPPORTED");
    }
    assert.equal(mock.calls(), 0);
  });

  it("rejects invented evidence identifiers even when model reports SUPPORTED", async () => {
    const mock = makeCaller((_job, call) => call === 4 ? supportedReview : { ...note, evidenceIds: ["obs-999"] });
    const result = await runAnalystTeam({
      request: "diagnose", objective: "health", observations: [observation()],
    }, { complete: mock.complete });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEAM_UNAVAILABLE");
    assert.equal(mock.calls(), 1);
  });

  it("fails closed when independent reviewer marks evidence insufficient", async () => {
    const mock = makeCaller((_job, call) => call === 4 ? { ...supportedReview, verdict: "INSUFFICIENT" } : note);
    const result = await runAnalystTeam({
      request: "diagnose", objective: "health", observations: [observation()],
    }, { complete: mock.complete });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEAM_UNSUPPORTED");
    assert.equal(mock.calls(), 4);
  });

  it("requires evidence IDs for any SUPPORTED conclusion", async () => {
    const mock = makeCaller((_job, call) =>
      call === 4 ? { ...supportedReview, evidenceIds: [] } : note);
    const result = await runAnalystTeam({
      request: "diagnose", objective: "health", observations: [observation()],
    }, { complete: mock.complete });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEAM_UNAVAILABLE");
  });

  it("redacts credentials from the evidence sent to every analyst", async () => {
    const mock = makeCaller((_job, call) => call === 4 ? supportedReview : note);
    const result = await runAnalystTeam({
      request: "diagnose",
      objective: "health",
      observations: [observation({ detail: "cpu=7%; password=supersecretvalue" })],
    }, { complete: mock.complete });
    assert.equal(result.ok, true);
    for (const request of mock.requests()) {
      assert.equal(request.includes("supersecretvalue"), false);
      assert.equal(request.includes("[REDACTED]"), true);
    }
  });

  it("rejects invalid reviewer responses and records no fabricated outcome", async () => {
    const mock = makeCaller((_job, call) =>
      call === 4 ? { ...supportedReview, verdict: "SHIP_IT" } : note);
    const result = await runAnalystTeam({
      request: "diagnose", objective: "health", observations: [observation()],
    }, { complete: mock.complete });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TEAM_UNAVAILABLE");
  });
});
