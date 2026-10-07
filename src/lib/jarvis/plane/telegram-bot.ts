import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { actorsFromEnv, type TelegramActor, type TelegramUpdate } from "./telegram.ts";
import { acceptTelegramVoice } from "../voice/turn.ts";
import { voiceLine } from "../voice/gate.ts";
import { synthesizeVoice } from "../voice/tts.ts";
import { mark } from "../metrics.ts";
import { deliverArtifact } from "./artifacts.ts";

export type BotApi = {
  getFile(fileId: string): Promise<string | null>;
  download(filePath: string): Promise<Buffer | null>;
  sendMessage(chatId: number, text: string): Promise<boolean>;
  sendVoice?(chatId: number, bytes: Buffer): Promise<boolean>;
  sendChatAction?(chatId: number, action: "typing" | "upload_document" | "upload_photo"): Promise<boolean>;
  sendDocument?(chatId: number, bytes: Buffer, fileName: string, caption?: string): Promise<boolean>;
  sendPhoto?(chatId: number, bytes: Buffer, fileName: string, caption?: string): Promise<boolean>;
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

function safeLeaf(value: string, fallback: string): string {
  const base = path.basename(value || fallback).replace(/[^A-Za-zА-Яа-я0-9._-]+/g, "_");
  return base && base !== "." && base !== ".." ? base.slice(0, 120) : fallback;
}

function maxInboundBytes(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.JARVIS_TELEGRAM_FILE_MAX_BYTES ?? 5 * 1024 * 1024);
  return Number.isFinite(raw) ? Math.max(1024, Math.min(20 * 1024 * 1024, Math.trunc(raw))) : 5 * 1024 * 1024;
}

function inboundRoot(stateDir: string, env: NodeJS.ProcessEnv): string {
  return path.resolve(env.JARVIS_INBOUND_DIR || path.join(stateDir, "inbound"));
}

function storeInbound(
  stateDir: string,
  env: NodeJS.ProcessEnv,
  updateId: number,
  bytes: Buffer,
  originalName: string,
  kind: "document" | "image",
): string | null {
  if (bytes.length === 0 || bytes.length > maxInboundBytes(env)) return null;
  const root = inboundRoot(stateDir, env);
  fs.mkdirSync(root, { recursive: true });
  const fallback = kind === "image" ? "image.bin" : "document.bin";
  const leaf = safeLeaf(originalName, fallback);
  const target = path.resolve(root, `${updateId}-${leaf}`);
  if (!target.startsWith(root + path.sep)) return null;
  fs.writeFileSync(target, bytes, { mode: 0o600 });
  return target;
}

export function createTelegramApi(env: NodeJS.ProcessEnv = process.env): BotApi | { code: "NOT_CONFIGURED" } {
  const token = env.JARVIS_TELEGRAM_TOKEN?.trim();
  const base = (env.JARVIS_TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");
  if (!token) return { code: "NOT_CONFIGURED" };

  async function jsonPost(method: string, body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`${base}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  }

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
      return jsonPost("sendMessage", { chat_id: chatId, text: text.slice(0, 3500) });
    },
    async sendChatAction(chatId, action) {
      return jsonPost("sendChatAction", { chat_id: chatId, action });
    },
    async sendVoice(chatId, bytes) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("voice", new Blob([new Uint8Array(bytes)], { type: "audio/ogg" }), "jarvis.ogg");
      const response = await fetch(`${base}/bot${token}/sendVoice`, { method: "POST", body: form });
      return response.ok;
    },
    async sendDocument(chatId, bytes, fileName, caption) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("document", new Blob([new Uint8Array(bytes)]), safeLeaf(fileName, "jarvis.bin"));
      if (caption) form.set("caption", caption.slice(0, 900));
      const response = await fetch(`${base}/bot${token}/sendDocument`, { method: "POST", body: form });
      return response.ok;
    },
    async sendPhoto(chatId, bytes, fileName, caption) {
      const form = new FormData();
      form.set("chat_id", String(chatId));
      form.set("photo", new Blob([new Uint8Array(bytes)]), safeLeaf(fileName, "jarvis.png"));
      if (caption) form.set("caption", caption.slice(0, 900));
      const response = await fetch(`${base}/bot${token}/sendPhoto`, { method: "POST", body: form });
      return response.ok;
    },
  };
}

export function telegramUpdate(body: unknown): { update: TelegramUpdate; chatId: number } | null {
  if (!body || typeof body !== "object") return null;
  const update = body as {
    update_id?: number;
    message?: {
      message_id?: number;
      text?: string;
      caption?: string;
      from?: { id?: number };
      chat?: { id?: number };
      voice?: { file_id?: string };
      document?: { file_id?: string; file_name?: string; file_size?: number };
      photo?: Array<{ file_id?: string; width?: number; height?: number; file_size?: number }>;
      reply_to_message?: { message_id?: number; text?: string; caption?: string };
      forward_from?: { id?: number };
      forward_origin?: { sender_user?: { id?: number } };
    };
  };
  const userId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (!Number.isInteger(update.update_id) || !Number.isInteger(userId) || !Number.isInteger(chatId)) return null;

  const photo = [...(update.message?.photo ?? [])]
    .filter((item) => typeof item.file_id === "string")
    .sort((left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0))[0];
  const reply = update.message?.reply_to_message;
  const replyTo = reply
    ? String(reply.message_id ?? "") + (reply.text || reply.caption ? ":" + String(reply.text ?? reply.caption).slice(0, 160) : "")
    : undefined;

  return {
    chatId: chatId as number,
    update: {
      updateId: update.update_id as number,
      userId: userId as number,
      text: update.message?.text ?? update.message?.caption,
      voiceFileId: update.message?.voice?.file_id,
      documentFileId: update.message?.document?.file_id,
      documentName: update.message?.document?.file_name,
      documentSize: update.message?.document?.file_size,
      imageFileId: photo?.file_id,
      replyTo,
      forwardedFromId: update.message?.forward_origin?.sender_user?.id ?? update.message?.forward_from?.id,
    },
  };
}

async function downloadById(api: BotApi, fileId: string): Promise<Buffer | null> {
  const filePath = await api.getFile(fileId);
  return filePath ? api.download(filePath) : null;
}

export async function sendTelegramArtifact(
  api: BotApi,
  chatId: number,
  input: { root: string; relative: string; caption?: string; asPhoto?: boolean },
): Promise<{ ok: boolean; code?: string }> {
  const root = path.resolve(input.root);
  const full = path.resolve(root, input.relative);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return { ok: false, code: "NOT_FOUND" };
  const bytes = fs.readFileSync(full);
  const preview = bytes.subarray(0, Math.min(bytes.length, 64 * 1024)).toString("utf8");
  const gate = deliverArtifact({ root, relative: input.relative, bytes: bytes.length, text: preview });
  if (!gate.ok) return { ok: false, code: gate.code };
  if (input.asPhoto && api.sendPhoto) {
    return { ok: await api.sendPhoto(chatId, bytes, path.basename(full), input.caption) };
  }
  if (!api.sendDocument) return { ok: false, code: "NOT_CONFIGURED" };
  return { ok: await api.sendDocument(chatId, bytes, path.basename(full), input.caption) };
}

export async function dispatchTelegram(
  body: unknown,
  opts: { stateDir: string; actors?: Record<string, TelegramActor>; api: BotApi; now?: Date; env?: NodeJS.ProcessEnv },
): Promise<{ code: string; sent: boolean; voiceSent?: boolean; attachmentStored?: boolean }> {
  const parsed = telegramUpdate(body);
  if (!parsed) return { code: "EMPTY", sent: false };
  const env = opts.env ?? process.env;
  const actors = opts.actors ?? actorsFromEnv(env);
  const actor = actors[String(parsed.update.userId)];
  if (!actor || actor.role !== "operator") return { code: "ACTOR_DENIED", sent: false };

  await opts.api.sendChatAction?.(parsed.chatId, "typing").catch(() => false);

  let attachmentStored = false;
  if (parsed.update.documentFileId || parsed.update.imageFileId) {
    const fileId = parsed.update.documentFileId ?? parsed.update.imageFileId!;
    const bytes = await downloadById(opts.api, fileId);
    if (bytes && bytes.length <= maxInboundBytes(env)) {
      const stored = storeInbound(
        opts.stateDir,
        env,
        parsed.update.updateId,
        bytes,
        parsed.update.documentName ?? (parsed.update.imageFileId ? "image.bin" : "document.bin"),
        parsed.update.imageFileId ? "image" : "document",
      );
      attachmentStored = Boolean(stored);
    }
    if (!parsed.update.text && !parsed.update.voiceFileId) {
      const text = attachmentStored
        ? "Вложение сохранено как недоверенный reference. Его содержимое не выполняется как команда."
        : "Вложение не принято: пустой файл, превышен лимит или загрузка не удалась.";
      return {
        code: attachmentStored ? "ATTACHMENT_STORED" : "ATTACHMENT_REJECTED",
        sent: await opts.api.sendMessage(parsed.chatId, text),
        attachmentStored,
      };
    }
  }

  let download: ((fileId: string) => Buffer | null) | undefined;
  if (parsed.update.voiceFileId) {
    const bytes = await downloadById(opts.api, parsed.update.voiceFileId);
    download = (fileId) => (fileId === parsed.update.voiceFileId ? bytes : null);
  }

  const result = acceptTelegramVoice(parsed.update, {
    stateDir: opts.stateDir,
    actors,
    now: opts.now,
    env,
    download,
  });
  const spoken = "voiceSummary" in result ? result.voiceSummary : voiceLine(result.code, null);
  const approvalPhrase = "technical" in result ? result.technical?.approval?.phrase : undefined;
  const contextBits = [
    parsed.update.replyTo ? `reply=${parsed.update.replyTo}` : "",
    parsed.update.forwardedFromId ? `forwarded_from=${parsed.update.forwardedFromId}` : "",
    attachmentStored ? "attachment=stored-untrusted" : "",
  ].filter(Boolean);
  const contextLine = contextBits.length ? "\nContext: " + contextBits.join("; ") : "";
  const text = approvalPhrase ? spoken + "\n" + approvalPhrase + contextLine : spoken + contextLine;
  const sent = await opts.api.sendMessage(parsed.chatId, text);

  let voiceSent = false;
  if (parsed.update.voiceFileId && opts.api.sendVoice) {
    const ttsStarted = Date.now();
    const speech = synthesizeVoice(spoken, env);
    mark("tts_ms", Date.now() - ttsStarted);
    if ("code" in speech) {
      if (speech.code !== "NOT_CONFIGURED") mark("tts_failures");
    } else {
      try {
        voiceSent = await opts.api.sendVoice(parsed.chatId, fs.readFileSync(speech.ogg));
        if (!voiceSent) mark("tts_failures");
      } finally {
        for (const file of speech.cleanup) fs.rmSync(file, { force: true });
      }
    }
  }
  return { code: result.code, sent, voiceSent, attachmentStored };
}

export async function handleTelegramWebhook(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const expected = env.JARVIS_TELEGRAM_WEBHOOK_SECRET ?? "";
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !sameSecret(supplied, expected)) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED" }, { status: 401 });
  }
  const api = createTelegramApi(env);
  if ("code" in api) return Response.json({ ok: false, code: api.code }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "SCHEMA_INVALID" }, { status: 400 });
  }

  const result = await dispatchTelegram(body, {
    stateDir: env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"),
    api,
    env,
  });
  return Response.json({ ok: true, code: result.code });
}
