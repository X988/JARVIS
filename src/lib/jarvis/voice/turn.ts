import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mark } from "../metrics.ts";
import { processCommand, type PipelineResult } from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";
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

function aliasesFromInventory(file = path.join(process.cwd(), "config/jarvis/inventory.json")): SpokenAlias[] {
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
  const heard = transcribeWav(wavPath, env);
  mark("voice_turns");
  if ("code" in heard) {
    mark("stt_failures");
    return { code: heard.code, voiceSummary: voiceLine(heard.code, null), technical: null, stt: null, originalAudioId: path.basename(wavPath) };
  }
  const normalized = normalizeTranscript(stripWake(heard.text, env.JARVIS_WAKE_WORD_ENABLED === "1"), heard.confidence, aliasesFromInventory());
  if (normalized.code === "CLARIFY") {
    return {
      code: "CLARIFY",
      voiceSummary: voiceLine("CLARIFY", null),
      technical: null,
      stt: heard,
      originalAudioId: path.basename(wavPath),
    };
  }
  const technical = processCommand({
    text: normalized.text,
    requestId: opts.requestId || randomUUID(),
    session: opts.session,
    stateDir: opts.stateDir,
    now: opts.now,
  });
  return {
    code: technical.code,
    voiceSummary: voiceLine(technical.code, technical.decision.reason, technical.approval?.id),
    technical,
    stt: { ...heard, text: normalized.text },
    originalAudioId: path.basename(wavPath),
  };
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
): VoiceTurn | { code: "ACTOR_DENIED" | "EMPTY" | "AUDIO_TOO_LARGE" } {
  const actors = opts.actors ?? actorsFromEnv(opts.env);
  if (!actors[String(update.userId)] || actors[String(update.userId)].role !== "operator") return { code: "ACTOR_DENIED" };
  if (!update.voiceFileId) {
    const text = acceptTelegram(update, { stateDir: opts.stateDir, actors, now: opts.now });
    if (!text.accepted) return { code: text.code === "ACTOR_DENIED" ? "ACTOR_DENIED" : "EMPTY" };
    return {
      code: text.result.code,
      voiceSummary: voiceLine(text.result.code, text.result.decision.reason, text.result.approval?.id),
      technical: text.result,
      stt: null,
      originalAudioId: null,
    };
  }
  const bytes = opts.download?.(update.voiceFileId) ?? null;
  if (!bytes) return { code: "EMPTY" };
  if (bytes.length > 8 * 1024 * 1024) return { code: "AUDIO_TOO_LARGE" };
  const root = audioRoot(opts.env);
  fs.mkdirSync(root, { recursive: true });
  const leaf = `tg-${update.updateId}.wav`;
  const target = safeAudioFile(root, leaf);
  if (!target) return { code: "EMPTY" };
  fs.writeFileSync(target, bytes);
  try {
    const session = sessionForTelegram(update.userId, actors, opts.now?.getTime());
    if (!session) return { code: "ACTOR_DENIED" };
    return runVoiceWav(target, {
      session,
      stateDir: opts.stateDir,
      requestId: `tg-${update.userId}-${update.updateId}`,
      env: opts.env,
      now: opts.now,
    });
  } finally {
    fs.rmSync(target, { force: true });
  }
}
