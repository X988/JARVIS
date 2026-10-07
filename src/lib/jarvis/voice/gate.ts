export const FRAME_MS = 30;
export const ENDPOINT_SILENCE_MS = 800;
export const MAX_UTTERANCE_MS = 30_000;
export const PRE_ROLL_MS = 240;
export const MIN_SPEECH_MS = 200;
export const MIN_CONFIDENCE = 0.55;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export type VoiceKind = "silence" | "noise" | "speech";

export type SpokenAlias = { from: string; to: string };

const HALLUCINATIONS = /^(thanks for watching|thank you\.?|you|субтитры|субтитры создавал.*|продолжение следует|спасибо за просмотр)\.?$/i;

export const SPOKEN: SpokenAlias[] = [
  { from: "ютп", to: "utp" },
  { from: "утепе", to: "utp" },
  { from: "ютепе", to: "utp" },
  { from: "уп", to: "utp" },
  { from: "майлков", to: "mailcow" },
  { from: "мейлков", to: "mailcow" },
  { from: "мейлкау", to: "mailcow" },
  { from: "микрот", to: "mikrotik" },
  { from: "микротик", to: "mikrotik" },
  { from: "вайргард", to: "wireguard" },
  { from: "вайр гард", to: "wireguard" },
];

export function classifyPcm(samples: Int16Array, sampleRate = 16_000): VoiceKind {
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  let peak = 0;
  let run = 0;
  let longest = 0;
  for (let index = 0; index < samples.length; index += frame) {
    let sum = 0;
    let count = 0;
    const end = Math.min(samples.length, index + frame);
    for (let cursor = index; cursor < end; cursor += 1) {
      const value = samples[cursor] / 32768;
      sum += value * value;
      count += 1;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    peak = Math.max(peak, rms);
    if (rms > 0.02) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  if (peak < 0.01) return "silence";
  if (longest * FRAME_MS < MIN_SPEECH_MS) return "noise";
  return "speech";
}

export function bargeIn(frames: { rms: number }[], noiseFloor: number): boolean {
  const need = Math.ceil(MIN_SPEECH_MS / FRAME_MS);
  let run = 0;
  for (const frame of frames) {
    if (frame.rms > Math.max(0.02, noiseFloor * 3)) run += 1;
    else run = 0;
    if (run >= need) return true;
  }
  return false;
}

export function prependPreroll(chunks: Int16Array[], preroll: Int16Array): Int16Array {
  const total = preroll.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  out.set(preroll, 0);
  let offset = preroll.length;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function hallucination(text: string): boolean {
  return HALLUCINATIONS.test(text.trim());
}

export function normalizeTranscript(
  text: string,
  confidence: number,
  aliases: SpokenAlias[] = SPOKEN,
): { text: string; changed: boolean; code: "OK" | "CLARIFY" } {
  if (confidence < MIN_CONFIDENCE) return { text, changed: false, code: "CLARIFY" };
  let next = text.replace(/[.,!?;:]+/g, " ");
  for (const alias of aliases) {
  if (alias.from.length < 2 || alias.from === alias.to) continue;
    const pattern = new RegExp(`(^|\\s)${alias.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "gi");
    next = next.replace(pattern, `$1${alias.to}`);
  }
  next = next.replace(/\s+/g, " ").trim();
  return { text: next, changed: next !== text.trim(), code: "OK" };
}

export function stripWake(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return text.replace(/^(джарвис|жарвис)[, ]+/i, "").trim();
}

export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[a-f0-9]{16,}\b/gi, " ")
    .replace(/[*_`#>[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentences(text: string): string[] {
  const clean = sanitizeForSpeech(text);
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function voiceLine(code: string, reason: string | null, approvalId?: string | null): string {
  if (code === "POLICY_DENIED" && /баз/i.test(reason ?? "")) return "Отказ. Удаление рабочей базы запрещено.";
  if (code === "POLICY_DENIED") return "Отказ. Политика это не разрешает.";
  if (code === "APPROVAL_REQUIRED") {
    return approvalId ? `Нужно подтверждение заявки ${approvalId}. Само не делаю.` : "Нужно подтверждение. Само не делаю.";
  }
  if (code === "CLARIFY" || code === "STT_LOW_CONFIDENCE") return "Не расслышал уверенно. Повторите команду.";
  if (code === "NO_SPEECH") return "Речи не было. Ничего не запускал.";
  if (code === "AUDIO_DECODE_FAILED") return "Голосовое не открылось. Ничего не запускал.";
  if (code === "EMPTY" || code === "AUDIO_TOO_LARGE") return "Голосовое не получено. Ничего не запускал.";
  const first = sentences(reason ?? "")[0];
  return first ? first.slice(0, 180) : "Готово. Подробности в тексте.";
}

export function wavConvertArgs(input: string, output: string): string[] {
  return ["-nostdin", "-y", "-i", input, "-ac", "1", "-ar", "16000", "-f", "wav", output];
}
