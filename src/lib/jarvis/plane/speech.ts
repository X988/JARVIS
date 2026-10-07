import { spawnSync } from "node:child_process";
import path from "node:path";
import { normalizeTranscript, SPOKEN } from "../voice/gate.ts";
import { audioRoot, transcribeWav, type SttFailure, type SttHit } from "../voice/whisper.ts";

export type SpeechHit = { text: string; confidence: number; provider: string };

export type SpeechInput = {
  wavPath?: string;
  transcript?: string;
  confidence?: number;
};

export interface SpeechToTextProvider {
  id: "mock" | "browser" | "whisper-cpp" | "faster-whisper";
  transcribe(input: SpeechInput): SpeechHit | SttFailure;
}

function confidence(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : fallback;
}

export class MockSpeechProvider implements SpeechToTextProvider {
  readonly id = "mock" as const;

  transcribe(input: SpeechInput): SpeechHit | SttFailure {
    if (!input.transcript?.trim()) return { code: "NOT_CONFIGURED" };
    return { text: input.transcript.trim(), confidence: confidence(input.confidence, 1), provider: this.id };
  }
}

/**
 * Browser speech is accepted only as untrusted text input.
 * It never becomes identity, approval, risk or target authority.
 */
export class BrowserSpeechProvider implements SpeechToTextProvider {
  readonly id = "browser" as const;

  transcribe(input: SpeechInput): SpeechHit | SttFailure {
    if (!input.transcript?.trim()) return { code: "NO_SPEECH" };
    return {
      text: input.transcript.trim(),
      confidence: confidence(input.confidence, 0.5),
      provider: this.id,
    };
  }
}

export type WhisperWrapperRunner = (
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => { status: number | null; stdout: string; error?: NodeJS.ErrnoException };

function runWhisperWrapper(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  const raw = Number(env.JARVIS_WHISPER_CPP_TIMEOUT_MS ?? 90_000);
  const timeout = Number.isFinite(raw) ? Math.max(5_000, Math.min(300_000, Math.trunc(raw))) : 90_000;
  const run = spawnSync(executable, args, {
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...env },
  });
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    error: run.error as NodeJS.ErrnoException | undefined,
  };
}

/**
 * whisper.cpp adapter contract.
 * JARVIS_WHISPER_CPP_WRAPPER is an executable, not a shell snippet.
 * It receives exactly one argument: jailed WAV path, and returns JSON:
 * {"text":"...","confidence":0.9}
 */
export class WhisperProvider implements SpeechToTextProvider {
  readonly id = "whisper-cpp" as const;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: WhisperWrapperRunner;

  constructor(env: NodeJS.ProcessEnv = process.env, runner: WhisperWrapperRunner = runWhisperWrapper) {
    this.env = env;
    this.runner = runner;
  }

  transcribe(input: SpeechInput): SpeechHit | SttFailure {
    const executable = this.env.JARVIS_WHISPER_CPP_WRAPPER?.trim();
    if (!executable || !input.wavPath) return { code: "NOT_CONFIGURED" };
    if (/[\r\n\0]/.test(executable)) return { code: "NOT_CONFIGURED" };

    const root = audioRoot(this.env);
    const wav = path.resolve(input.wavPath);
    if (wav !== root && !wav.startsWith(root + path.sep)) return { code: "STT_FAILED" };

    const run = this.runner(executable, [wav], this.env);
    if (run.error?.code === "ENOENT") return { code: "NOT_CONFIGURED" };
    if (run.status !== 0 || !run.stdout.trim()) return { code: "STT_FAILED" };
    try {
      const body = JSON.parse(run.stdout) as { text?: string; confidence?: number };
      if (!body.text?.trim()) return { code: "NO_SPEECH" };
      return {
        text: body.text.trim(),
        confidence: confidence(body.confidence, 0),
        provider: this.id,
      };
    } catch {
      return { code: "STT_FAILED" };
    }
  }
}

/**
 * Authoritative faster-whisper provider.
 * It requires an actual WAV path and never labels a supplied transcript as STT output.
 */
export class FasterWhisperProvider implements SpeechToTextProvider {
  readonly id = "faster-whisper" as const;
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  transcribe(input: SpeechInput): SttHit | SttFailure {
    if (!input.wavPath) return { code: "NOT_CONFIGURED" };
    return transcribeWav(input.wavPath, this.env);
  }
}

export function normalizeHeard(text: string, confidenceValue: number): { text: string; changed: boolean } {
  const next = normalizeTranscript(text, confidenceValue, SPOKEN);
  return { text: next.text, changed: next.changed };
}

export function wakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JARVIS_WAKE_WORD === "1" || env.JARVIS_WAKE_WORD_ENABLED === "1";
}

export type TtsMode = "disabled" | "local" | "cloud";

export function ttsMode(env: NodeJS.ProcessEnv = process.env): TtsMode {
  if (env.JARVIS_TTS === "cloud") return "cloud";
  if (env.JARVIS_TTS === "local" || env.JARVIS_TTS_PROVIDER === "piper") return "local";
  return "disabled";
}
