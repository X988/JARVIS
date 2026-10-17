import { ENDPOINT_SILENCE_MS, MAX_UTTERANCE_MS, MIN_SPEECH_MS, PRE_ROLL_MS } from "./gate.ts";

export const SPEECH_RMS = 0.02;

// The browser adds PRE_ROLL_MS before VAD decides that speech has started.
// Stop comfortably before the strict server-side JARVIS_STT_MAX_MS limit.
export const MAX_CLIENT_UTTERANCE_MS = Math.max(
  MIN_SPEECH_MS + 1000,
  MAX_UTTERANCE_MS - PRE_ROLL_MS - 600,
);


export type ListenState = {
  phase: "idle" | "speech";
  speechMs: number;
  silenceMs: number;
  utteranceMs: number;
};

export type ListenEvent = "none" | "start" | "endpoint" | "max";

export type ListenConfig = {
  minSpeechMs: number;
  silenceMs: number;
  maxUtteranceMs: number;
  speechRms: number;
};

export const LISTEN_INITIAL: ListenState = {
  phase: "idle",
  speechMs: 0,
  silenceMs: 0,
  utteranceMs: 0,
};

const DEFAULT_LISTEN: ListenConfig = {
  minSpeechMs: MIN_SPEECH_MS,
  silenceMs: ENDPOINT_SILENCE_MS,
  maxUtteranceMs: MAX_UTTERANCE_MS,
  speechRms: SPEECH_RMS,
};

export function stepListen(
  state: ListenState,
  rms: number,
  frameMs: number,
  config: Partial<ListenConfig> = {},
): { state: ListenState; event: ListenEvent } {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return { state, event: "none" };
  const cfg = { ...DEFAULT_LISTEN, ...config };
  const voiced = Number.isFinite(rms) && rms >= cfg.speechRms;
  if (state.phase === "idle") {
    if (!voiced) return { state: LISTEN_INITIAL, event: "none" };
    const speechMs = state.speechMs + frameMs;
    if (speechMs < cfg.minSpeechMs) {
      return { state: { ...state, speechMs }, event: "none" };
    }
    return {
      state: { phase: "speech", speechMs, silenceMs: 0, utteranceMs: speechMs },
      event: "start",
    };
  }
  const utteranceMs = state.utteranceMs + frameMs;
  if (!voiced) {
    const silenceMs = state.silenceMs + frameMs;
    if (silenceMs >= cfg.silenceMs || utteranceMs >= cfg.maxUtteranceMs) {
      return {
        state: { ...state, silenceMs, utteranceMs },
        event: utteranceMs >= cfg.maxUtteranceMs && silenceMs < cfg.silenceMs ? "max" : "endpoint",
      };
    }
    return { state: { ...state, silenceMs, utteranceMs }, event: "none" };
  }
  if (utteranceMs >= cfg.maxUtteranceMs) {
    return { state: { ...state, silenceMs: 0, utteranceMs }, event: "max" };
  }
  return {
    state: { ...state, silenceMs: 0, utteranceMs, speechMs: state.speechMs + frameMs },
    event: "none",
  };
}

export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

export function downsampleAverage(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) return input;
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.min(input.length, Math.floor(index * ratio));
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sum += input[cursor];
      count += 1;
    }
    out[index] = count > 0 ? sum / count : 0;
  }
  return out;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodeWavFromPcm16(samples: Int16Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(offset, samples[index], true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return encodeWavFromPcm16(pcm, sampleRate);
}

export function parsePcmWav(bytes: Uint8Array): { sampleRate: number; samples: Int16Array } | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (size < 0 || start + size > view.byteLength) return null;
    if (id === "fmt ") {
      if (size < 16) return null;
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === "data") {
      dataStart = start;
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (audioFormat !== 1 || channels !== 1 || bits !== 16 || sampleRate <= 0 || dataStart < 0) return null;
  const count = Math.floor(dataSize / 2);
  const samples = new Int16Array(count);
  for (let index = 0; index < count; index += 1) samples[index] = view.getInt16(dataStart + index * 2, true);
  return { sampleRate, samples };
}

export function resamplePcm16(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return samples;
  const floats = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) floats[index] = samples[index] / 32768;
  const down = downsampleAverage(floats, fromRate, toRate);
  const out = new Int16Array(down.length);
  for (let index = 0; index < down.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, down[index]));
    out[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

/** Extra safeguard against VAD/frame rounding sending an oversized WAV. */
export function limitVoiceSamples(samples: Float32Array, sampleRate = 16_000): Float32Array {
  const maxSamples = Math.floor((sampleRate * (MAX_UTTERANCE_MS - 250)) / 1000);
  return samples.length > maxSamples ? samples.slice(0, maxSamples) : samples;
}

export function concatFloats(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
