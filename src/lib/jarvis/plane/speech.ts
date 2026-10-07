import { normalizeTranscript, SPOKEN } from "../voice/gate.ts";

export type SpeechHit = { text: string; confidence: number; provider: string };

export interface SpeechToTextProvider {
  id: "browser" | "whisper" | "faster-whisper" | "mock";
  transcribe(input: { audio?: Uint8Array; transcript?: string }): SpeechHit | { code: "NOT_CONFIGURED" };
}

export class MockSpeechProvider implements SpeechToTextProvider {
  readonly id = "mock" as const;
  transcribe(input: { transcript?: string }): SpeechHit | { code: "NOT_CONFIGURED" } {
    if (!input.transcript) return { code: "NOT_CONFIGURED" };
    return { text: input.transcript, confidence: 1, provider: this.id };
  }
}

export class FasterWhisperProvider implements SpeechToTextProvider {
  readonly id = "faster-whisper" as const;
  transcribe(input: { transcript?: string }): SpeechHit | { code: "NOT_CONFIGURED" } {
    if (!input.transcript) return { code: "NOT_CONFIGURED" };
    return { text: input.transcript, confidence: 1, provider: this.id };
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
  if (env.JARVIS_TTS === "local" || env.JARVIS_TTS === "cloud") return env.JARVIS_TTS;
  return "disabled";
}
