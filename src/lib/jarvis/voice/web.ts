import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { executionMode, guardWebPost } from "../server/http.ts";
import { validRequestId } from "../server/idempotency.ts";
import { hearWav, materializeClip, readSpokenWav, runVoiceConversation } from "./call.ts";
import type { VoiceHearResponse, VoiceTurnResponse } from "./contract.ts";
import { MAX_AUDIO_BYTES } from "./gate.ts";
import { audioRoot, sweepAudio } from "./whisper.ts";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function stateDir(): string {
  return process.env.JARVIS_STATE_DIR || process.cwd() + "/data";
}

async function readLimited(request: Request, max: number): Promise<Uint8Array | "too-large"> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return "too-large";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > max) return "too-large";
  return bytes;
}

function mediaType(request: Request): string {
  return (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

function isAudio(type: string): boolean {
  return type.startsWith("audio/") || type === "application/octet-stream";
}

export async function handleVoiceHear(request: Request): Promise<Response> {
  const guard = await guardWebPost(request, "voice-hear", 20);
  if (!guard.ok) return guard.response;
  const bytes = await readLimited(request, MAX_AUDIO_BYTES);
  if (bytes === "too-large") {
    return json({ code: "AUDIO_TOO_LARGE", text: null, raw: null, confidence: null, message: "Голосовая фраза слишком большая." }, 413);
  }
  if (bytes.byteLength < 44) {
    return json({ code: "NO_SPEECH", text: null, raw: null, confidence: null, message: "Речь не распознана. Ничего не запускал." }, 200);
  }
  sweepAudio(audioRoot(), 60 * 60_000);
  const clip = materializeClip(bytes);
  if ("code" in clip) {
    return json({ code: clip.code, text: null, raw: null, confidence: null, message: "Не удалось открыть запись. Ничего не запускал." }, 400);
  }
  try {
    const heard: VoiceHearResponse = hearWav(clip.wav, clip.samples);
    const status = heard.code === "OK" || heard.code === "NO_SPEECH" || heard.code === "CLARIFY" || heard.code === "STT_LOW_CONFIDENCE"
      ? 200
      : heard.code === "AUDIO_TOO_LONG"
        ? 413
        : heard.code === "NOT_CONFIGURED" || heard.code === "STT_FAILED"
          ? 503
          : 422;
    return json(heard, status);
  } finally {
    for (const file of clip.cleanup) fs.rmSync(file, { force: true });
  }
}

export async function handleVoiceTurn(request: Request, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardWebPost(request, "voice-turn", 12);
  if (!guard.ok) return guard.response;
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  const requestIdRaw = typeof body.request_id === "string"
    ? body.request_id
    : typeof body.requestId === "string"
      ? body.requestId
      : "";
  const requestId = requestIdRaw ? requestIdRaw.trim() : randomUUID();
  if (!validRequestId(requestId)) return json({ code: "SCHEMA_INVALID" }, 400);
  const result: VoiceTurnResponse = await runVoiceConversation(body.text, {
    session: guard.session,
    stateDir: stateDir(),
    requestId,
    mode: executionMode(),
  });
  const status = result.code === "APPROVAL_REQUIRED" || result.code === "MUTATION_REQUIRES_APPROVAL"
    ? 202
    : result.code === "AUTH_REQUIRED"
      ? 401
      : result.code === "ACTOR_DENIED" || result.code === "POLICY_DENIED"
        ? result.command ? 200 : 403
        : result.code === "AGENT_DISABLED" || result.code === "LLM_UNAVAILABLE" || result.code === "NOT_CONFIGURED"
          ? 503
          : 200;
  return json(result, status);
}

export async function handleVoiceSpeak(request: Request, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardWebPost(request, "voice-speak", 48);
  if (!guard.ok) return guard.response;
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 600) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  const spoken = readSpokenWav(body.text);
  if ("code" in spoken) {
    const status = spoken.code === "NOT_CONFIGURED" ? 503 : 502;
    return json({ code: spoken.code }, status);
  }
  return new Response(new Uint8Array(spoken.bytes), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleVoice(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ code: "SCHEMA_INVALID" }, 405);
  const type = mediaType(request);
  if (isAudio(type)) return handleVoiceHear(request);
  if (!type.startsWith("application/json")) return json({ code: "SCHEMA_INVALID" }, 400);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 64 * 1024) return json({ code: "SCHEMA_INVALID" }, 413);
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ code: "SCHEMA_INVALID" }, 400);
  const body = parsed as Record<string, unknown>;
  if (body.action === "speak") return handleVoiceSpeak(request, body);
  if (body.action === "turn") return handleVoiceTurn(request, body);
  return json({ code: "SCHEMA_INVALID" }, 400);
}
