import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { encodeWavFromPcm16 } from "./endpoint.ts";
import { readWarmState, startSttWarmup, transcribeWav } from "./whisper.ts";

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), "testdata/fake-stt.sh");

function setup(mode: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stt-"));
  const env = {
    PATH: process.env.PATH,
    JARVIS_STT_PROVIDER: "faster-whisper",
    JARVIS_PYTHON_BIN: fake,
    JARVIS_STATE_DIR: dir,
    JARVIS_AUDIO_DIR: path.join(dir, "audio"),
    FAKE_STT_MODE: mode,
    FAKE_STT_COUNTER: path.join(dir, "counter"),
  } as NodeJS.ProcessEnv;
  fs.mkdirSync(env.JARVIS_AUDIO_DIR!, { recursive: true });
  const wav = path.join(env.JARVIS_AUDIO_DIR!, "clip.wav");
  fs.writeFileSync(wav, encodeWavFromPcm16(new Int16Array(16_000), 16_000));
  return { env, wav };
}

describe("stt warm-up", () => {
  it("marks the model warm after transcribing silence at start", async () => {
    const { env } = setup("silence");
    assert.equal(readWarmState(env).state, "cold");
    const state = await startSttWarmup(env);
    assert.equal(state.state, "warm");
    assert.equal(readWarmState(env).state, "warm");
    assert.equal(fs.readdirSync(env.JARVIS_AUDIO_DIR!).filter((f) => f.startsWith("warmup-")).length, 0);
  });

  it("reports failed (not ready) when the model cannot load", async () => {
    const { env } = setup("broken");
    const state = await startSttWarmup(env);
    assert.equal(state.state, "failed");
    assert.match(state.detail ?? "", /cuda unavailable/);
  });

  it("can be disabled with JARVIS_STT_WARMUP=0", async () => {
    const { env } = setup("silence");
    const state = await startSttWarmup({ ...env, JARVIS_STT_WARMUP: "0" });
    assert.equal(state.state, "cold");
  });

  it("retries a crashed first transcription once and then marks STT warm", () => {
    const { env, wav } = setup("crash-once");
    const hit = transcribeWav(wav, env);
    assert.ok(!("code" in hit), JSON.stringify(hit));
    assert.equal(hit.text, "проверь сервер");
    assert.equal(readWarmState(env).state, "warm");
  });
});
