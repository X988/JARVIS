import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mark } from "../metrics.ts";
import { processCommand, type PipelineResult } from "../server/pipeline.ts";
import { canExecute, type Session } from "../server/session.ts";
import { acceptTelegram, actorsFromEnv, sessionForTelegram, type TelegramActor, type TelegramUpdate } from "../plane/telegram.ts";
import { classifyPcm, normalizeTranscript, SPOKEN, stripWake, voiceLine, wavConvertArgs, type SpokenAlias } from "./gate.ts";
import { audioRoot, safeAudioFile, sweepAudio, transcribeWav, type SttHit } from "./whisper.ts";

export type VoiceTurn = {
  code: string;
  voiceSummary: string;
  technical: PipelineResult | null;
  stt: SttHit | null;
  originalAudioId: string | null;
};

function readPcm(wav: Buffer): Int16Array | null {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return null;
  const payload = wav.subarray(44);
  const samples = new Int16Array(Math.floor(payload.length / 2));
  for (let index = 0; index < samples.length; index += 1) samples[index] = payload.readInt16LE(index * 2);
  return samples;
}

export function inventoryAliases(file = path.join(process.cwd(), "config/jarvis/inventory.json")): SpokenAlias[] {
  const extra = [...SPOKEN];
  if (!fs.existsSync(file)) return extra;
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
    targets?: { voiceCanonical?: string; aliases?: string[] }[];
  };
  for (const target of doc.targets ?? []) {
    if (!target.voiceCanonical) continue;
    for (const alias of target.aliases ?? []) {
      if (alias.toLowerCase() !== target.voiceCanonical.toLowerCase()) extra.push({ from: alias.toLowerCase(), to: target.voiceCanonical });
    }
  }
  return extra;
}

export function runVoiceWav(
  wavPath: string,
  opts: { session: Session; stateDir: string; requestId?: string; env?: NodeJS.ProcessEnv; now?: Date },
): VoiceTurn {
  const env = opts.env ?? process.env;
  sweepAudio(audioRoot(env), 60 * 60_000);
  const wav = fs.readFileSync(wavPath);
  const pcm = readPcm(wav);
  if (!pcm || classifyPcm(pcm) !== "speech") {
    return { code: "NO_SPEECH", voiceSummary: voiceLine("NO_SPEECH", null), technical: null, stt: null, originalAudioId: null };
  }
  const sttStarted = Date.now();
  const heard = transcribeWav(wavPath, env);
  mark("stt_ms", Date.now() - sttStarted);
  mark("voice_turns");
  if ("code" in heard) {
    mark("stt_failures");
    return { code: heard.code, voiceSummary: voiceLine(heard.code, null), technical: null, stt: null, originalAudioId: path.basename(wavPath) };
  }
  const minConfidenceRaw = Number(env.JARVIS_STT_MIN_CONFIDENCE ?? "0.55");
  const minConfidence = Number.isFinite(minConfidenceRaw) ? Math.min(0.95, Math.max(0.1, minConfidenceRaw)) : 0.55;
  const normalized = normalizeTranscript(
    stripWake(heard.text, env.JARVIS_WAKE_WORD_ENABLED === "1"),
    heard.confidence,
    inventoryAliases(),
    minConfidence,
  );
  if (normalized.code === "CLARIFY" || !normalized.text.trim()) {
    return {
      code: "CLARIFY",
      voiceSummary: voiceLine("CLARIFY", null),
      technical: null,
      stt: heard,
      originalAudioId: path.basename(wavPath),
    };
  }
  const technical = processCommand({
    channel: "voice",
    text: normalized.text,
    requestId: opts.requestId || randomUUID(),
    session: opts.session,
    stateDir: opts.stateDir,
    now: opts.now,
  });
  return {
    code: technical.code,
    voiceSummary: voiceLine(technical.code, technical.decision.reason, technical.approval?.id, {
      mode: technical.mode,
      executionCalled: technical.executionCalled,
      target: technical.trace.target,
      runbook: technical.trace.runbook,
      execution: technical.trace.execution,
    }),
    technical,
    stt: { ...heard, text: normalized.text },
    originalAudioId: path.basename(wavPath),
  };
}

export function decodeTelegramAudio(
  bytes: Buffer,
  env: NodeJS.ProcessEnv = process.env,
): { wav: string; cleanup: string[] } | { code: "AUDIO_DECODE_FAILED" } {
  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const source = safeAudioFile(root, `ogg-${randomUUID()}.ogg`);
  if (!source) return { code: "AUDIO_DECODE_FAILED" };
  fs.writeFileSync(source, bytes);
  const wav = convertToWav(source, env);
  if (!wav) {
    fs.rmSync(source, { force: true });
    return { code: "AUDIO_DECODE_FAILED" };
  }
  return { wav, cleanup: [source, wav] };
}

export function convertToWav(source: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const output = safeAudioFile(root, `wav-${randomUUID()}.wav`);
  const input = path.resolve(source);
  if (!output || !input.startsWith(root + path.sep)) return null;
  const run = spawnSync("ffmpeg", wavConvertArgs(input, output), { timeout: 15_000 });
  if (run.status !== 0) return null;
  return output;
}

export function acceptTelegramVoice(
  update: TelegramUpdate,
  opts: {
    stateDir: string;
    actors?: Record<string, TelegramActor>;
    now?: Date;
    download?: (fileId: string) => Buffer | null;
    env?: NodeJS.ProcessEnv;
  },
): VoiceTurn | { code: "ACTOR_DENIED" | "EMPTY" | "AUDIO_TOO_LARGE" | "AUDIO_DECODE_FAILED" } {
  const actors = opts.actors ?? actorsFromEnv(opts.env);
  if (!actors[String(update.userId)] || !canExecute(actors[String(update.userId)].role)) return { code: "ACTOR_DENIED" };
  if (!update.voiceFileId) {
    const text = acceptTelegram(update, { stateDir: opts.stateDir, actors, now: opts.now });
    if (!text.accepted) return { code: text.code === "ACTOR_DENIED" ? "ACTOR_DENIED" : "EMPTY" };
    return {
      code: text.result.code,
      voiceSummary: voiceLine(text.result.code, text.result.decision.reason, text.result.approval?.id, {
        mode: text.result.mode,
        executionCalled: text.result.executionCalled,
        target: text.result.trace.target,
        runbook: text.result.trace.runbook,
        execution: text.result.trace.execution,
      }),
      technical: text.result,
      stt: null,
      originalAudioId: null,
    };
  }
  const bytes = opts.download?.(update.voiceFileId) ?? null;
  if (!bytes) return { code: "EMPTY" };
  if (bytes.length > 8 * 1024 * 1024) return { code: "AUDIO_TOO_LARGE" };
  const decoded = decodeTelegramAudio(bytes, opts.env);
  if ("code" in decoded) return decoded;
  try {
    const session = sessionForTelegram(update.userId, actors, opts.now?.getTime());
    if (!session) return { code: "ACTOR_DENIED" };
    return runVoiceWav(decoded.wav, {
      session,
      stateDir: opts.stateDir,
      requestId: `tg-${update.userId}-${update.updateId}`,
      env: opts.env,
      now: opts.now,
    });
  } finally {
    for (const file of decoded.cleanup) fs.rmSync(file, { force: true });
  }
}
