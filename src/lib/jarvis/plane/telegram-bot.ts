import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { actorsFromEnv, type TelegramActor, type TelegramUpdate } from "./telegram.ts";
import { acceptTelegramVoice } from "../voice/turn.ts";
import { voiceLine } from "../voice/gate.ts";
import { synthesizeVoice } from "../voice/tts.ts";

export type BotApi = {
  getFile(fileId: string): Promise<string | null>;
  download(filePath: string): Promise<Buffer | null>;
  sendMessage(chatId: number, text: string): Promise<boolean>;
  sendVoice?(chatId: number, bytes: Buffer): Promise<boolean>;
};

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeFilePath(filePath: string): string | null {
  if (!filePath || filePath.startsWith("/") || filePath.includes("..")) return null;
  const normal = path.posix.normalize(filePath);
  if (normal.startsWith("..") || normal.startsWith("/")) return null;
  return normal;
}

export function createTelegramApi(env: NodeJS.ProcessEnv = process.env): BotApi | { code: "NOT_CONFIGURED" } {
  const token = env.JARVIS_TELEGRAM_TOKEN?.trim();
  const base = (env.JARVIS_TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");
  if (!token) return { code: "NOT_CONFIGURED" };
  return {
    async getFile(fileId) {
      const response = await fetch(`${base}/bot${token}/getFile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { ok?: boolean; result?: { file_path?: string } };
      return body.ok ? safeFilePath(body.result?.file_path ?? "") : null;
    },
    async download(filePath) {
      const safe = safeFilePath(filePath);
      if (!safe) return null;
      const response = await fetch(`${base}/file/bot${token}/${safe}`);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    },
    async sendMessage(chatId, text) {
      const response = await fetch(`${base}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 400) }),
      });
      return response.ok;
    },
    async sendVoice(chatId, bytes) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("voice", new Blob([new Uint8Array(bytes)], { type: "audio/ogg" }), "jarvis.ogg");
      const response = await fetch(`${base}/bot${token}/sendVoice`, { method: "POST", body: form });
      return response.ok;
    },
  };
}

export function telegramUpdate(body: unknown): { update: TelegramUpdate; chatId: number } | null {
  if (!body || typeof body !== "object") return null;
  const update = body as {
    update_id?: number;
    message?: { message_id?: number; text?: string; from?: { id?: number }; chat?: { id?: number }; voice?: { file_id?: string } };
  };
  const userId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (!Number.isInteger(update.update_id) || !Number.isInteger(userId) || !Number.isInteger(chatId)) return null;
  return {
    chatId: chatId as number,
    update: {
      updateId: update.update_id as number,
      userId: userId as number,
      text: update.message?.text,
      voiceFileId: update.message?.voice?.file_id,
    },
  };
}

export async function dispatchTelegram(
  body: unknown,
  opts: { stateDir: string; actors?: Record<string, TelegramActor>; api: BotApi; now?: Date; env?: NodeJS.ProcessEnv },
): Promise<{ code: string; sent: boolean; voiceSent?: boolean }> {
  const parsed = telegramUpdate(body);
  if (!parsed) return { code: "EMPTY", sent: false };
  const actors = opts.actors ?? actorsFromEnv(opts.env);
  const actor = actors[String(parsed.update.userId)];
  if (!actor || actor.role !== "operator") return { code: "ACTOR_DENIED", sent: false };
  let download: ((fileId: string) => Buffer | null) | undefined;
  if (parsed.update.voiceFileId) {
    const filePath = await opts.api.getFile(parsed.update.voiceFileId);
    const bytes = filePath ? await opts.api.download(filePath) : null;
    download = (fileId) => (fileId === parsed.update.voiceFileId ? bytes : null);
  }
  const result = acceptTelegramVoice(parsed.update, {
    stateDir: opts.stateDir,
    actors,
    now: opts.now,
    env: opts.env,
    download,
  });
  const text = "voiceSummary" in result ? result.voiceSummary : voiceLine(result.code, null);
  const sent = await opts.api.sendMessage(parsed.chatId, text);
  let voiceSent = false;
  if (parsed.update.voiceFileId && opts.api.sendVoice) {
    const speech = synthesizeVoice(text, opts.env);
    if (!("code" in speech)) {
      try {
        voiceSent = await opts.api.sendVoice(parsed.chatId, fs.readFileSync(speech.ogg));
      } finally {
        for (const file of speech.cleanup) fs.rmSync(file, { force: true });
      }
    }
  }
  return { code: result.code, sent, voiceSent };
}

export async function handleTelegramWebhook(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const expected = env.JARVIS_TELEGRAM_WEBHOOK_SECRET ?? "";
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !sameSecret(supplied, expected)) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  }
  const api = createTelegramApi(env);
  if ("code" in api) return Response.json({ ok: false, code: api.code }, { status: 503 });
  const result = await dispatchTelegram(await request.json(), {
    stateDir: env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"),
    api,
    env,
  });
  return Response.json({ ok: true, code: result.code });
}
