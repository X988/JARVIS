import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { audioRoot, safeAudioFile } from "./whisper.ts";
import { sanitizeForSpeech } from "./gate.ts";

export type TtsHit = {
  provider: "piper";
  wav: string;
  ogg: string;
  text: string;
  cleanup: string[];
};

export type TtsFailure = {
  code: "NOT_CONFIGURED" | "TTS_FAILED" | "AUDIO_ENCODE_FAILED";
};

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function modelPath(env: NodeJS.ProcessEnv): string | null {
  const raw = env.JARVIS_TTS_MODEL?.trim();
  if (!raw) return null;
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

export function ttsProbe(env: NodeJS.ProcessEnv = process.env): {
  provider: string;
  model: string;
  ready: boolean;
} {
  const provider = env.JARVIS_TTS_PROVIDER || "disabled";
  const model = env.JARVIS_TTS_MODEL || "";
  if (provider !== "piper") return { provider, model, ready: false };
  const resolved = modelPath(env);
  if (!resolved) return { provider, model, ready: false };
  const bin = env.JARVIS_TTS_BIN?.trim() || "piper";
  const probe = spawnSync(bin, ["--help"], { encoding: "utf8", timeout: 5_000 });
  return { provider, model: resolved, ready: probe.status === 0 };
}

export function synthesizeVoice(
  sourceText: string,
  env: NodeJS.ProcessEnv = process.env,
): TtsHit | TtsFailure {
  if ((env.JARVIS_TTS_PROVIDER || "disabled") !== "piper") return { code: "NOT_CONFIGURED" };
  const model = modelPath(env);
  if (!model) return { code: "NOT_CONFIGURED" };

  const text = sanitizeForSpeech(sourceText).slice(0, bounded(env.JARVIS_TTS_MAX_CHARS, 360, 80, 600));
  if (!text) return { code: "TTS_FAILED" };

  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const wav = safeAudioFile(root, "tts-" + randomUUID() + ".wav");
  const ogg = safeAudioFile(root, "tts-" + randomUUID() + ".ogg");
  if (!wav || !ogg) return { code: "TTS_FAILED" };

  const bin = env.JARVIS_TTS_BIN?.trim() || "piper";
  const timeout = bounded(env.JARVIS_TTS_TIMEOUT_MS, 30_000, 5_000, 120_000);
  const run = spawnSync(bin, ["--model", model, "--output_file", wav], {
    encoding: "utf8",
    timeout,
    input: text + "\n",
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error || run.status !== 0 || !fs.existsSync(wav) || fs.statSync(wav).size === 0) {
    fs.rmSync(wav, { force: true });
    fs.rmSync(ogg, { force: true });
    return { code: error?.code === "ENOENT" ? "NOT_CONFIGURED" : "TTS_FAILED" };
  }

  const encoded = spawnSync(
    "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-i",
      wav,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-application",
      "voip",
      ogg,
    ],
    { timeout: 15_000 },
  );
  if (encoded.status !== 0 || !fs.existsSync(ogg) || fs.statSync(ogg).size === 0) {
    fs.rmSync(wav, { force: true });
    fs.rmSync(ogg, { force: true });
    return { code: "AUDIO_ENCODE_FAILED" };
  }

  return { provider: "piper", wav, ogg, text, cleanup: [wav, ogg] };
}
