import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { handleCommand, handleSession } from "../server/http.ts";
import { processCommand } from "../server/pipeline.ts";
import { testSession } from "../server/session.ts";
import { hearWav, runVoiceConversation } from "./call.ts";
import { handleVoice } from "./web.ts";
import {
  LISTEN_INITIAL,
  downsampleAverage,
  encodeWavPcm16,
  parsePcmWav,
  stepListen,
} from "./endpoint.ts";
import { speechChunks } from "./gate.ts";
import { MAX_AUDIO_BYTES } from "./gate.ts";

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-call-"));
}

function restore(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function operatorHeaders(): Promise<Record<string, string>> {
  const opened = await handleSession(new Request("http://127.0.0.1/api/session", {
    headers: { "x-jarvis-test-actor": "admin1" },
  }));
  const csrf = opened.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
  const token = decodeURIComponent(csrf.split("=")[1] ?? "");
  return {
    "x-jarvis-test-actor": "admin1",
    cookie: csrf,
    "x-jarvis-csrf": token,
  };
}

describe("call endpoint", () => {
  it("starts on sustained speech and ends on silence", () => {
    let state = LISTEN_INITIAL;
    let event = "none" as string;
    ({ state, event } = stepListen(state, 0.2, 100));
    ({ state, event } = stepListen(state, 0, 100));
    assert.equal(state.phase, "idle");
    assert.equal(event, "none");
    state = LISTEN_INITIAL;
    ({ state, event } = stepListen(state, 0.05, 100));
    ({ state, event } = stepListen(state, 0.05, 100));
    assert.equal(event, "start");
    for (let index = 0; index < 7; index += 1) ({ state, event } = stepListen(state, 0, 100));
    assert.equal(event, "none");
    ({ state, event } = stepListen(state, 0, 100));
    assert.equal(event, "endpoint");
  });

  it("caps a long utterance", () => {
    let state = LISTEN_INITIAL;
    let event = "none" as string;
    ({ state, event } = stepListen(state, 0.05, 200, { maxUtteranceMs: 300 }));
    assert.equal(event, "start");
    ({ state, event } = stepListen(state, 0.05, 100, { maxUtteranceMs: 300 }));
    assert.equal(event, "max");
  });

  it("downsamples and round-trips a mono wav", () => {
    const down = downsampleAverage(Float32Array.from([0.5, 0.5, -0.5, -0.5]), 4, 2);
    assert.equal(down.length, 2);
    assert.ok(Math.abs(down[0] - 0.5) < 0.001);
    assert.ok(Math.abs(down[1] + 0.5) < 0.001);
    const wav = encodeWavPcm16(Float32Array.from([0, 0.25, -0.25]), 16_000);
    const parsed = parsePcmWav(wav);
    assert.ok(parsed);
    assert.equal(parsed?.sampleRate, 16_000);
    assert.equal(parsed?.samples.length, 3);
    assert.equal(parsed?.samples[0], 0);
  });

  it("splits spoken replies into sentences and never speaks a confirmation token", () => {
    const chunks = speechChunks("Первая фраза. Вторая фраза длиннее и остаётся целиком.");
    assert.deepEqual(chunks, ["Первая фраза.", "Вторая фраза длиннее и остаётся целиком."]);
    const hidden = speechChunks("Нужно подтверждение. CONFIRM APPROVAL-20261013-ABCD больше не диктую.");
    assert.equal(hidden.some((line) => /CONFIRM APPROVAL/.test(line)), false);
  });
});

describe("voice conversation", () => {
  it("keeps a live read on the voice channel and still explains dry-run", async () => {
    const session = testSession("admin1");
    const live = await runVoiceConversation("Проверь сервер", {
      session,
      stateDir: dir(),
      requestId: "voice-read",
      mode: "real",
    });
    assert.equal(live.executionCalled, false);
    assert.match(live.spoken, /не вызывает исполнителя/);
    const dry = await runVoiceConversation("Проверь сервер", {
      session,
      stateDir: dir(),
      requestId: "voice-dry",
      mode: "dry-run",
    });
    assert.equal(dry.executionCalled, false);
    assert.match(dry.spoken, /dry-run/);
  });

  it("does not execute a mutation and does not dictate the confirm phrase", async () => {
    const stateDir = dir();
    const result = await runVoiceConversation("Сделай резервную копию базы utp", {
      session: testSession("admin1"),
      stateDir,
      requestId: "voice-backup",
      mode: "real",
      now: new Date("2026-10-13T12:00:00Z"),
    });
    assert.equal(result.kind, "command");
    assert.equal(result.code, "APPROVAL_REQUIRED");
    assert.equal(result.executionCalled, false);
    assert.match(result.spoken, /подтверждени/i);
    assert.equal(/CONFIRM APPROVAL/.test(result.spoken), false);
    assert.equal(result.sentences.some((line) => /CONFIRM APPROVAL/.test(line)), false);
    assert.ok(result.command?.approval?.phrase.startsWith("CONFIRM "));
  });

  it("refuses a voice path that claims a mutation already ran", async () => {
    const stateDir = dir();
    const session = testSession("admin1");
    const sample = processCommand({
      text: "Проверь сервер",
      requestId: "voice-seed",
      session,
      stateDir,
      mode: "dry-run",
    });
    const result = await runVoiceConversation("Проверь сервер", {
      session,
      stateDir,
      requestId: "voice-guard",
      mode: "real",
      command: () => ({
        ...sample,
        executionCalled: true,
        decision: { ...sample.decision, mutation: true, verdict: "allow" },
      }),
    });
    assert.equal(result.executionCalled, false);
    assert.equal(result.code, "POLICY_DENIED");
    assert.match(result.spoken, /не выполняет/);
  });

  it("sends an unknown phrase to the agent and audits it without an executor", async () => {
    const stateDir = dir();
    const result = await runVoiceConversation("Расскажи, какая погода на крыше ангара", {
      session: testSession("admin1"),
      stateDir,
      requestId: "voice-chat",
      mode: "dry-run",
      agent: async () => ({
        code: "OK",
        answer: "На крыше сухо. Вторая фраза короткая.",
        plan: null,
        observations: [],
        provider: "ollama",
        model: "qwen3:8b",
      }),
    });
    assert.equal(result.kind, "agent");
    assert.equal(result.executionCalled, false);
    assert.equal(result.sentences[0], "На крыше сухо.");
    assert.equal(result.sentences[1], "Вторая фраза короткая.");
    const audit = fs.readFileSync(path.join(stateDir, "audit.jsonl"), "utf8");
    assert.match(audit, /voice-chat/);
    assert.match(audit, /VOICE_NO_EXECUTE/);
    assert.equal(audit.includes('"executor":""') || audit.includes('"executor": ""'), true);
  });
});

describe("voice http", () => {
  it("requires an operator session and ignores spoken approval fields", async () => {
    const previous = {
      JARVIS_TEST_AUTH: process.env.JARVIS_TEST_AUTH,
      JARVIS_STATE_DIR: process.env.JARVIS_STATE_DIR,
      EXECUTION_MODE: process.env.EXECUTION_MODE,
      JARVIS_TTS_PROVIDER: process.env.JARVIS_TTS_PROVIDER,
    };
    process.env.JARVIS_TEST_AUTH = "1";
    process.env.JARVIS_STATE_DIR = dir();
    process.env.EXECUTION_MODE = "dry-run";
    process.env.JARVIS_TTS_PROVIDER = "disabled";
    try {
      const anon = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "turn", text: "Проверь сервер" }),
      }));
      assert.equal(anon.status, 401);

      const stranger = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", "x-jarvis-test-actor": "stranger" },
        body: JSON.stringify({ action: "turn", text: "Проверь сервер" }),
      }));
      assert.equal(stranger.status, 403);

      const headers = await operatorHeaders();
      const opened = await handleCommand(new Request("http://127.0.0.1/api/commands", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ text: "Сделай резервную копию базы utp", request_id: "voice-http-backup" }),
      }));
      const approval = await opened.json() as { code: string; approval: { id: string; phrase: string } };
      assert.equal(approval.code, "APPROVAL_REQUIRED");

      const forged = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          action: "turn",
          text: "Сделай резервную копию базы utp",
          request_id: "voice-http-spoken",
          approval_id: approval.approval.id,
          confirmation: approval.approval.phrase,
          approved: true,
          risk: 0,
        }),
      }));
      const body = await forged.json() as {
        code: string;
        executionCalled: boolean;
        spoken: string;
        command: { approval: { id: string } | null };
      };
      assert.equal(body.code, "APPROVAL_REQUIRED");
      assert.equal(body.executionCalled, false);
      assert.equal(/CONFIRM APPROVAL/.test(body.spoken), false);
      assert.notEqual(body.command.approval?.id, approval.approval.id);

      const silence = encodeWavPcm16(new Float32Array(16_000), 16_000);
      const silenceBody = new ArrayBuffer(silence.byteLength);
      new Uint8Array(silenceBody).set(silence);
      const heard = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { ...headers, "content-type": "audio/wav" },
        body: silenceBody,
      }));
      const heardBody = await heard.json() as { code: string };
      assert.equal(heard.status, 200);
      assert.equal(heardBody.code, "NO_SPEECH");

      const speak = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ action: "speak", text: "Проверка завершена." }),
      }));
      assert.equal(speak.status, 503);
      assert.equal((await speak.json() as { code: string }).code, "NOT_CONFIGURED");

      const huge = new ArrayBuffer(MAX_AUDIO_BYTES + 1);
      const oversized = await handleVoice(new Request("http://127.0.0.1/api/voice", {
        method: "POST",
        headers: { ...headers, "content-type": "audio/wav" },
        body: huge,
      }));
      assert.equal(oversized.status, 413);
    } finally {
      restore(previous);
    }
  });
});

describe("voice env blank keys", () => {
  it("treats JARVIS_STT_MAX_MS= as unset instead of a 1s cap", () => {
    const samples = new Int16Array(16_000 * 2);
    const heard = hearWav("/nonexistent.wav", samples, { JARVIS_STT_MAX_MS: "" } as NodeJS.ProcessEnv);
    assert.notEqual(heard.code, "AUDIO_TOO_LONG");
  });
});
