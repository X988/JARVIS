import { normalizeTranscript, SPOKEN } from "../voice/gate.ts";
import { transcribeWav, type SttFailure, type SttHit } from "../voice/whisper.ts";

export type SpeechHit = { text: string; confidence: number; provider: string };

export interface SpeechToTextProvider {
  id: "mock" | "faster-whisper";
  transcribe(input: { wavPath?: string; transcript?: string }): SpeechHit | SttFailure;
}

export class MockSpeechProvider implements SpeechToTextProvider {
  readonly id = "mock" as const;

  transcribe(input: { transcript?: string }): SpeechHit | SttFailure {
    if (!input.transcript) return { code: "NOT_CONFIGURED" };
    return { text: input.transcript, confidence: 1, provider: this.id };
  }
}

/**
 * Authoritative faster-whisper provider.
 * It requires an actual WAV path and never labels a supplied transcript as STT output.
 */
export class FasterWhisperProvider implements SpeechToTextProvider {
  readonly id = "faster-whisper" as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  transcribe(input: { wavPath?: string }): SttHit | SttFailure {
    if (!input.wavPath) return { code: "NOT_CONFIGURED" };
    return transcribeWav(input.wavPath, this.env);
  }
}

export function normalizeHeard(text: string, confidence: number): { text: string; changed: boolean } {
  const next = normalizeTranscript(text, confidence, SPOKEN);
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
