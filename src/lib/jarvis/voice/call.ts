import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { appendAudit } from "../audit-log.ts";
import { mark } from "../metrics.ts";
import { runAgentTurn, type AgentTurnResult } from "../plane/agent-runtime.ts";
import { runHybridTurn, type HybridTurnResult } from "../plane/hybrid.ts";
import type { FetchLike } from "../plane/llm-client.ts";
import {
  processCommand,
  processRegisteredReadOnlyTool,
  type ExecCall,
  type ExecResult,
  type Mode,
  type PipelineResult,
} from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";
import { defaultRealExecute } from "../server/adapters.ts";
import { runbookById } from "../server/runbooks.ts";
import type { VoiceCommand, VoiceHearResponse, VoiceTurnResponse } from "./contract.ts";
import {
  encodeWavFromPcm16,
  parsePcmWav,
  resamplePcm16,
} from "./endpoint.ts";
import {
  classifyPcm,
  normalizeTranscript,
  speechChunks,
  stripWake,
  voiceLine,
  MIN_CONFIDENCE,
} from "./gate.ts";
import { synthesizeWav, ttsConfigured } from "./tts.ts";
import { convertToWav, inventoryAliases } from "./turn.ts";
import { audioRoot, safeAudioFile, sweepAudio, transcribeWav } from "./whisper.ts";

const SAMPLE_RATE = 16_000;

/** Refusal used for anything voice may not run. */
function voiceDoesNotExecute(): ExecResult {
  return {
    called: false,
    code: "POLICY_DENIED",
    detail: "Голос не выполняет изменения. Повторите текстом и подтвердите (CONFIRM).",
  };
}

/**
 * Voice may run strictly read-only runbooks. The decision is made here on the
 * server from the runbook registry (risk 0, mutates=false, policy ALLOW); no
 * client field reaches it. Anything else is refused before the executor.
 * JARVIS_VOICE_READ_EXECUTE=0 turns voice back into a no-execute channel.
 */
export function voiceExecute(env: NodeJS.ProcessEnv = process.env, real: (call: ExecCall) => ExecResult = defaultRealExecute) {
  return (call: ExecCall): ExecResult => {
    if (env.JARVIS_VOICE_READ_EXECUTE?.trim() === "0") {
      return { called: false, code: "EXECUTION_DISABLED", detail: "Голосовой канал не вызывает исполнителя (JARVIS_VOICE_READ_EXECUTE=0)." };
    }
    const book = runbookById(call.runbook);
    if (!book || book.mutates || book.risk !== 0 || book.policy !== "ALLOW") return voiceDoesNotExecute();
    return real({ ...call, channel: "voice" });
  };
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  // Blank keys from .env templates (`JARVIS_STT_MAX_MS=`) mean "unset", not 0.
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function writeCanonicalWav(samples: Int16Array, env: NodeJS.ProcessEnv): string | null {
  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const target = safeAudioFile(root, `wav-${randomUUID()}.wav`);
  if (!target) return null;
  fs.writeFileSync(target, encodeWavFromPcm16(samples, SAMPLE_RATE));
  return target;
}

export function materializeClip(
  bytes: Uint8Array,
  env: NodeJS.ProcessEnv = process.env,
): { wav: string; samples: Int16Array; cleanup: string[] } | { code: "AUDIO_DECODE_FAILED" } {
  const parsed = parsePcmWav(bytes);
  if (parsed) {
    const samples = parsed.sampleRate === SAMPLE_RATE
      ? parsed.samples
      : resamplePcm16(parsed.samples, parsed.sampleRate, SAMPLE_RATE);
    const wav = writeCanonicalWav(samples, env);
    if (!wav) return { code: "AUDIO_DECODE_FAILED" };
    return { wav, samples, cleanup: [wav] };
  }
  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const source = safeAudioFile(root, `up-${randomUUID()}.bin`);
  if (!source) return { code: "AUDIO_DECODE_FAILED" };
  fs.writeFileSync(source, bytes);
  const wav = convertToWav(source, env);
  if (!wav) {
    fs.rmSync(source, { force: true });
    return { code: "AUDIO_DECODE_FAILED" };
  }
  const encoded = fs.readFileSync(wav);
  const again = parsePcmWav(encoded);
  if (!again) {
    fs.rmSync(source, { force: true });
    fs.rmSync(wav, { force: true });
    return { code: "AUDIO_DECODE_FAILED" };
  }
  const samples = again.sampleRate === SAMPLE_RATE
    ? again.samples
    : resamplePcm16(again.samples, again.sampleRate, SAMPLE_RATE);
  return { wav, samples, cleanup: [source, wav] };
}

export function hearWav(
  wavPath: string,
  samples: Int16Array,
  env: NodeJS.ProcessEnv = process.env,
): VoiceHearResponse {
  const maxMs = bounded(env.JARVIS_STT_MAX_MS, 30_000, 1_000, 60_000);
  if (samples.length > Math.round((SAMPLE_RATE * maxMs) / 1000)) {
    return { code: "AUDIO_TOO_LONG", text: null, raw: null, confidence: null, message: voiceLine("AUDIO_TOO_LONG", null) };
  }
  if (classifyPcm(samples, SAMPLE_RATE) !== "speech") {
    return { code: "NO_SPEECH", text: null, raw: null, confidence: null, message: voiceLine("NO_SPEECH", null) };
  }
  const started = Date.now();
  const heard = transcribeWav(wavPath, env);
  mark("stt_ms", Date.now() - started);
  mark("voice_turns");
  if ("code" in heard) {
    mark("stt_failures");
    return { code: heard.code, text: null, raw: null, confidence: null, message: voiceLine(heard.code, null) };
  }
  const minConfidenceRaw = Number(env.JARVIS_STT_MIN_CONFIDENCE?.trim() || String(MIN_CONFIDENCE));
  const minConfidence = Number.isFinite(minConfidenceRaw) ? Math.min(0.95, Math.max(0.1, minConfidenceRaw)) : MIN_CONFIDENCE;
  const normalized = normalizeTranscript(
    stripWake(heard.text, env.JARVIS_WAKE_WORD_ENABLED === "1"),
    heard.confidence,
    inventoryAliases(),
    minConfidence,
  );
  if (normalized.code === "CLARIFY" || !normalized.text.trim()) {
    return {
      code: "CLARIFY",
      text: normalized.text || heard.text,
      raw: heard.text,
      confidence: heard.confidence,
      message: voiceLine("CLARIFY", null),
    };
  }
  return {
    code: "OK",
    text: normalized.text,
    raw: heard.text,
    confidence: heard.confidence,
    message: null,
  };
}

function spokenAgent(result: AgentTurnResult): string {
  if (result.code === "AGENT_DISABLED") return "Модель на сервере выключена. Команды из списка всё равно разбираются.";
  if (result.code === "AUTH_REQUIRED" || result.code === "ACTOR_DENIED") return "Нужна сессия оператора. Ничего не запускал.";
  if (result.code === "LLM_UNAVAILABLE" || result.code === "NOT_CONFIGURED") {
    return "Модель сейчас не отвечает. Ничего не запускал.";
  }
  if (result.code === "PLAN_INVALID") {
    return "Не смог составить допустимый план для этой команды: такого действия нет среди разрешённых. Ничего не запускал.";
  }
  if (result.code === "PLAN_REJECTED") {
    return `Команда отклонена политикой. ${result.answer?.trim() || ""} Ничего не запускал.`.replace(/\s+/g, " ").trim();
  }
  if (result.code === "MUTATION_REQUIRES_APPROVAL") return voiceLine("APPROVAL_REQUIRED", null);
  const clean = result.answer?.trim();
  if (!clean) return "Ответа нет. Ничего не запускал.";
  return clean;
}

function asCommand(result: PipelineResult): VoiceCommand {
  return {
    code: result.code,
    verdict: result.verdict,
    mode: result.mode,
    executionCalled: result.executionCalled,
    auditId: result.auditId,
    requestId: result.requestId,
    trace: result.trace,
    decision: result.decision,
    approval: result.approval,
  };
}

function chunkSpoken(text: string, env: NodeJS.ProcessEnv): string[] {
  const maxChars = Math.trunc(bounded(env.JARVIS_TTS_MAX_CHARS, 360, 80, 600));
  return speechChunks(text, maxChars, 8);
}

export async function runVoiceConversation(
  text: string,
  opts: {
    session: Session | null;
    stateDir: string;
    requestId: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    mode?: Mode;
    fetch?: FetchLike;
    agent?: Parameters<typeof runHybridTurn>[1]["agent"];
    command?: Parameters<typeof runHybridTurn>[1]["command"];
    /** Test seam for the real executor; never reachable from HTTP input. */
    realExecute?: (call: ExecCall) => ExecResult;
  },
): Promise<VoiceTurnResponse> {
  const env = opts.env ?? process.env;
  const execute = voiceExecute(env, opts.realExecute);
  const command = opts.command ?? ((input: Parameters<typeof processCommand>[0]) => {
    const safe = { ...input, execute, channel: "voice" as const };
    delete safe.approval;
    return processCommand(safe);
  });
  const agent = opts.agent ?? ((utterance: string, agentOpts: Parameters<typeof runAgentTurn>[1]) => {
    return runAgentTurn(utterance, {
      ...agentOpts,
      toolRunner: (tool) => processRegisteredReadOnlyTool({ ...tool, channel: "voice", execute }),
    });
  });
  const result: HybridTurnResult = await runHybridTurn(text, {
    session: opts.session,
    stateDir: opts.stateDir,
    requestId: opts.requestId,
    env,
    now: opts.now,
    mode: opts.mode,
    fetch: opts.fetch,
    agent,
    command,
  });

  if (result.kind === "command" && result.executionCalled && result.decision.mutation) {
    const spoken = "Голос не выполняет изменения. Ничего не запускал.";
    return {
      code: "POLICY_DENIED",
      spoken,
      sentences: chunkSpoken(spoken, env),
      kind: "command",
      executionCalled: false,
      mode: result.mode,
      tts: ttsConfigured(env),
      command: {
        ...asCommand(result),
        code: "POLICY_DENIED",
        verdict: "deny",
        executionCalled: false,
        decision: {
          ...result.decision,
          verdict: "deny",
          reason: spoken,
          forceDeny: true,
        },
        approval: null,
      },
      answer: null,
    };
  }

  if (result.kind === "command") {
    const spoken = voiceLine(result.code, result.decision.reason, result.approval?.id, {
      mode: result.mode,
      executionCalled: result.executionCalled,
      target: result.trace.target,
      runbook: result.trace.runbook,
      execution: result.trace.execution,
    });
    return {
      code: result.code,
      spoken,
      sentences: chunkSpoken(spoken, env),
      kind: "command",
      executionCalled: result.executionCalled,
      mode: result.mode,
      tts: ttsConfigured(env),
      command: asCommand(result),
      answer: null,
    };
  }

  const spoken = spokenAgent(result);
  appendAudit(
    {
      at: (opts.now ?? new Date()).toISOString(),
      executionId: randomUUID(),
      actor: opts.session?.accountId ?? "anonymous",
      action: "voice-chat",
      verdict: result.code === "OK" || result.code === "DRY_RUN" || result.code === "CLARIFY" ? "clarify" : "deny",
      sessionId: opts.session?.id ?? "",
      commandId: opts.requestId,
      normalized: text.slice(0, 500),
      target: "—",
      runbook: "voice.conversation",
      risk: 0,
      policy: "VOICE_READ_ONLY",
      approvalId: "",
      executor: "",
      result: result.code,
      verification: "голос: только read-only runbooks, изменения запрещены",
      channel: "voice",
    },
    opts.stateDir,
  );
  return {
    code: result.code,
    spoken,
    sentences: chunkSpoken(spoken, env),
    kind: "agent",
    executionCalled: (result.observations ?? []).some((item) => item.executionCalled),
    mode: opts.mode ?? "dry-run",
    tts: ttsConfigured(env),
    command: null,
    answer: spoken,
  };
}

export function readSpokenWav(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): { bytes: Buffer; text: string } | { code: "NOT_CONFIGURED" | "TTS_FAILED" | "AUDIO_ENCODE_FAILED" } {
  sweepAudio(audioRoot(env), 60 * 60_000);
  const hit = synthesizeWav(text, env);
  if ("code" in hit) return hit;
  try {
    const bytes = fs.readFileSync(hit.wav);
    if (bytes.length === 0) return { code: "TTS_FAILED" };
    return { bytes, text: hit.text };
  } finally {
    for (const file of hit.cleanup) fs.rmSync(file, { force: true });
  }
}
