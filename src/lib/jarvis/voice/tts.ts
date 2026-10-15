import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { audioRoot, safeAudioFile } from "./whisper.ts";
import { sanitizeForSpeech, sentences } from "./gate.ts";

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

export interface TextToSpeechProvider {
  id: "disabled" | "piper" | "cloud";
  synthesize(text: string): TtsHit | TtsFailure;
}

export class DisabledTtsProvider implements TextToSpeechProvider {
  readonly id = "disabled" as const;
  synthesize(_text: string): TtsFailure {
    return { code: "NOT_CONFIGURED" };
  }
}

export class PiperTtsProvider implements TextToSpeechProvider {
  readonly id = "piper" as const;
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  synthesize(text: string): TtsHit | TtsFailure {
    return synthesizeVoice(text, this.env);
  }
}

/**
 * Cloud TTS is an explicit extension point only. A provider-specific vetted
 * adapter must be implemented before this class can send text off-host.
 */
export class CloudTtsProvider implements TextToSpeechProvider {
  readonly id = "cloud" as const;
  synthesize(_text: string): TtsFailure {
    return { code: "NOT_CONFIGURED" };
  }
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  // Blank keys from .env templates (`JARVIS_STT_MAX_MS=`) mean "unset", not 0.
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function modelPath(env: NodeJS.ProcessEnv): string | null {
  const raw = env.JARVIS_TTS_MODEL?.trim();
  if (!raw) return null;
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

export function speechText(sourceText: string, maxChars = 360): string {
  const clean = sanitizeForSpeech(sourceText);
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const complete = sentences(clean);
  let out = "";
  for (const sentence of complete) {
    const candidate = out ? out + " " + sentence : sentence;
    if (candidate.length > maxChars) break;
    out = candidate;
  }
  if (out) return out;
  const clipped = clean.slice(0, maxChars + 1);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= Math.floor(maxChars * 0.6) ? clipped.slice(0, boundary) : clean.slice(0, maxChars)).trim();
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

export type WavHit = {
  provider: "piper";
  wav: string;
  text: string;
  cleanup: string[];
};

export function ttsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.JARVIS_TTS_PROVIDER || "disabled") === "piper" && modelPath(env) !== null;
}

/** Piper WAV only. The browser call plays this directly and skips the Telegram Opus encode. */
export function synthesizeWav(sourceText: string, env: NodeJS.ProcessEnv = process.env): WavHit | TtsFailure {
  if ((env.JARVIS_TTS_PROVIDER || "disabled") !== "piper") return { code: "NOT_CONFIGURED" };
  const model = modelPath(env);
  if (!model) return { code: "NOT_CONFIGURED" };

  const maxChars = Math.trunc(bounded(env.JARVIS_TTS_MAX_CHARS, 360, 80, 600));
  const text = speechText(sourceText, maxChars);
  if (!text) return { code: "TTS_FAILED" };

  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const wav = safeAudioFile(root, "tts-" + randomUUID() + ".wav");
  if (!wav) return { code: "TTS_FAILED" };

  const bin = env.JARVIS_TTS_BIN?.trim() || "piper";
  const timeout = Math.trunc(bounded(env.JARVIS_TTS_TIMEOUT_MS, 30_000, 5_000, 120_000));
  const lengthScale = bounded(env.JARVIS_TTS_LENGTH_SCALE, 1.0, 0.65, 1.5);
  const sentenceSilence = bounded(env.JARVIS_TTS_SENTENCE_SILENCE, 0.18, 0, 1.0);
  const run = spawnSync(
    bin,
    [
      "--model",
      model,
      "--output_file",
      wav,
      "--length_scale",
      String(lengthScale),
      "--sentence_silence",
      String(sentenceSilence),
    ],
    { encoding: "utf8", timeout, input: text + "\n" },
  );
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error || run.status !== 0 || !fs.existsSync(wav) || fs.statSync(wav).size === 0) {
    fs.rmSync(wav, { force: true });
    return { code: error?.code === "ENOENT" ? "NOT_CONFIGURED" : "TTS_FAILED" };
  }
  return { provider: "piper", wav, text, cleanup: [wav] };
}

export function synthesizeVoice(sourceText: string, env: NodeJS.ProcessEnv = process.env): TtsHit | TtsFailure {
  const spoken = synthesizeWav(sourceText, env);
  if ("code" in spoken) return spoken;

  const root = audioRoot(env);
  const ogg = safeAudioFile(root, "tts-" + randomUUID() + ".ogg");
  if (!ogg) {
    fs.rmSync(spoken.wav, { force: true });
    return { code: "TTS_FAILED" };
  }
  const encoded = spawnSync(
    "ffmpeg",
    [
      "-nostdin", "-y", "-i", spoken.wav, "-ac", "1", "-ar", "48000",
      "-c:a", "libopus", "-b:a", "32k", "-application", "voip", ogg,
    ],
    { timeout: 15_000 },
  );
  if (encoded.status !== 0 || !fs.existsSync(ogg) || fs.statSync(ogg).size === 0) {
    fs.rmSync(spoken.wav, { force: true });
    fs.rmSync(ogg, { force: true });
    return { code: "AUDIO_ENCODE_FAILED" };
  }
  return { provider: "piper", wav: spoken.wav, ogg, text: spoken.text, cleanup: [spoken.wav, ogg] };
}


export function ttsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): TextToSpeechProvider {
  const provider = env.JARVIS_TTS_PROVIDER?.trim().toLowerCase();
  if (provider === "piper") return new PiperTtsProvider(env);
  if (provider === "cloud") return new CloudTtsProvider();
  return new DisabledTtsProvider();
}
