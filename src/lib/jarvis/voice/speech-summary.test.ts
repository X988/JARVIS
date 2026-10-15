import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fallbackSpoken, sanitizeSpeakable, spokenSummary, SPOKEN_MAX_CHARS } from "./speech-summary.ts";
import { runVoiceConversation } from "./call.ts";
import { testSession } from "../server/session.ts";
import { summarizeLog } from "../server/mikromcp.ts";
import { NETWORK_DIAG, networkDiagnosisPlan, type AgentTurnResult } from "../plane/agent-runtime.ts";
import { routeDeterministic } from "../plane/hybrid.ts";
import type { FetchLike } from "../plane/llm-client.ts";

const RAW_REPORT = [
  "1. Что обнаружено.",
  "mikrotik.status@MikroTik CCR1009 (MikroTik-KP): mikromcp:get_system_status: board=CCR1009-7G-1C; cpu_load=2%",
  "mikrotik.logs@rb5009: log_entries=50; latest: [10:01] dhcp,info: lease 00:11:22:33:44:55 assigned",
  "2. Чем подтверждается.",
  "audit=19bc01f66d488a74fc81917f9ef6ad630e3d94214984eedf0d6e84632077d917 /home/toor/jarvis/data/audit.jsonl",
  "**Итог**: `ok`",
].join("\n");

const UNSPEAKABLE = /([0-9a-f]{2}:){5}[0-9a-f]{2}|[0-9a-f]{16,}|\/home\/|\w+=\S|\*\*|`|@|mikromcp:|^\s*\d\./im;

function report(): AgentTurnResult {
  return {
    code: "AGENT_PARTIAL",
    answer: RAW_REPORT,
    plan: null,
    provider: "rules",
    model: "network-diagnosis",
    observations: [
      { tool: "mikrotik.status", target: "rb5009", code: "OK", detail: "mikromcp:get_system_status: board=CCR1009-7G-1C; cpu_load=2%; memory_used=46%", verification: "", executionCalled: true, auditId: "a".repeat(64) },
      { tool: "mikrotik.interfaces", target: "rb5009", code: "OK", detail: "mikromcp:list_interfaces: interfaces=20; running=15; disabled=2; down=combo1,ether6,vlan3", verification: "", executionCalled: true, auditId: "b" },
      { tool: "mikrotik.logs", target: "rb5009", code: "OK", detail: "mikromcp:get_log: log_entries=50; checked=50; errors=3; warnings=1; by_topic=dhcp:30,system:10; error_kinds=login failure for user admin from via winbox:3", verification: "", executionCalled: true, auditId: "c" },
      { tool: "mikrotik.routes", target: "rb5009", code: "EXECUTION_TIMEOUT", detail: "timeout", verification: "", executionCalled: true, auditId: "d" },
    ],
  };
}

function ollama(content: string): { env: NodeJS.ProcessEnv; fetch: FetchLike } {
  return {
    env: { JARVIS_LLM_MODE: "LOCAL_ONLY", JARVIS_LLM_FAILOVER: "ollama", JARVIS_OLLAMA_URL: "http://127.0.0.1:11434", JARVIS_OLLAMA_MODEL: "t", JARVIS_LLM_RETRY_ATTEMPTS: "1" },
    fetch: async () => new Response(JSON.stringify({ message: { content } }), { status: 200 }),
  };
}

describe("voice spoken summary", () => {
  it("sanitizes markdown, MACs, hashes, paths, ids and key=value before TTS", () => {
    const out = sanitizeSpeakable(RAW_REPORT);
    assert.doesNotMatch(out, UNSPEAKABLE);
    assert.ok(out.length <= SPOKEN_MAX_CHARS);
  });

  it("caps long text at a sentence boundary", () => {
    const out = sanitizeSpeakable("Короткое предложение номер один. ".repeat(40));
    assert.ok(out.length <= SPOKEN_MAX_CHARS, String(out.length));
    assert.match(out, /\.$/);
  });

  it("rule-based fallback names the main problems without raw data", () => {
    const out = fallbackSpoken(report());
    assert.match(out, /ether6/);
    assert.match(out, /3 ошибок/);
    assert.match(out, /экране/);
    assert.doesNotMatch(out, UNSPEAKABLE);
  });

  it("uses the model's summary but still strips anything unspeakable", async () => {
    const { env, fetch } = ollama(JSON.stringify({ spoken: "Сеть в целом работает. Не подняты ether6 и vlan3, audit=abcdef0123456789abcdef. Подробный отчёт на экране." }));
    const out = await spokenSummary(report(), { env, fetch });
    assert.match(out, /^Сеть в целом работает/);
    assert.doesNotMatch(out, UNSPEAKABLE);
  });

  it("falls back when the model is unavailable", async () => {
    const out = await spokenSummary(report(), { env: {} });
    assert.equal(out, fallbackSpoken(report()));
  });

  it("voice turn speaks a short summary while the screen keeps the full report", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-speech-"));
    const result = await runVoiceConversation("Джарвис, проведи диагностику сети", {
      session: testSession("admin1"),
      stateDir,
      requestId: "voice-net",
      mode: "real",
      env: { ...process.env, JARVIS_LLM_MODE: "LOCAL_ONLY", JARVIS_OLLAMA_URL: "" },
      agent: async () => report(),
    });
    assert.ok(result.spoken.length <= SPOKEN_MAX_CHARS);
    assert.doesNotMatch(result.spoken, UNSPEAKABLE);
    assert.doesNotMatch(result.sentences.join(" "), UNSPEAKABLE);
    assert.match(result.answer ?? "", /1\. Что обнаружено/);
  });
});

describe("network diagnosis", () => {
  it("recognizes the phrase and routes it to the agent with fixed read-only router checks", () => {
    for (const phrase of ["Джарвис, проведи диагностику сети", "проверь сеть", "Что с сетью?"]) {
      assert.ok(NETWORK_DIAG.test(phrase), phrase);
      assert.equal(routeDeterministic(phrase, "real"), false);
    }
    const plan = networkDiagnosisPlan();
    assert.equal(plan.ok, true);
    if (plan.ok) assert.deepEqual(plan.plan.steps.map((s) => s.tool), ["mikrotik.status", "mikrotik.interfaces", "mikrotik.routes", "mikrotik.logs"]);
  });

  it("summarizes the router log by count and type instead of dumping lines", () => {
    const out = summarizeLog([
      { time: "1", topics: "system,error,critical", message: "login failure for user admin from 10.0.0.5 via winbox" },
      { time: "2", topics: "system,error,critical", message: "login failure for user admin from 10.0.0.6 via winbox" },
      { time: "3", topics: "dhcp,info", message: "lease 00:11:22:33:44:55 assigned to 192.168.0.9" },
      { time: "4", topics: "interface,warning", message: "ether6 link down" },
    ], 120);
    assert.match(out, /log_entries=120; checked=4; errors=2; warnings=1/);
    assert.match(out, /login failure for user admin from via winbox:2/);
    assert.doesNotMatch(out, /00:11:22|192\.168|10\.0\.0/);
  });
});
