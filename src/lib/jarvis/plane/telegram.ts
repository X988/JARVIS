import { OPERATORS } from "../model.ts";
import { processCommand, type PipelineResult } from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";

export type TelegramUpdate = {
  updateId: number;
  userId: number;
  username?: string;
  text?: string;
  voiceFileId?: string;
  documentName?: string;
  replyTo?: string;
};

export type TelegramOutcome =
  | { accepted: false; code: "ACTOR_DENIED" | "STT_UNAVAILABLE" | "EMPTY" }
  | { accepted: true; result: PipelineResult };

export function allowlistFromEnv(env: NodeJS.ProcessEnv = process.env): number[] {
  const raw = env.JARVIS_TELEGRAM_IDS ?? String(OPERATORS.find((item) => item.allowed)?.telegramId ?? "");
  return raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export function sessionForTelegram(userId: number, allow: number[], now = Date.now()): Session | null {
  if (!allow.includes(userId)) return null;
  const operator = OPERATORS.find((item) => item.telegramId === userId && item.allowed);
  if (!operator) return null;
  return {
    id: `tg-${userId}`,
    accountId: operator.id,
    role: "operator",
    expiresAt: now + 15 * 60_000,
    channel: "telegram",
  };
}

export function acceptTelegram(
  update: TelegramUpdate,
  opts: { stateDir: string; allow?: number[]; now?: Date; transcript?: string | null },
): TelegramOutcome {
  const allow = opts.allow ?? allowlistFromEnv();
  const session = sessionForTelegram(update.userId, allow, opts.now?.getTime());
  if (!session) return { accepted: false, code: "ACTOR_DENIED" };
  if (update.voiceFileId && !opts.transcript) return { accepted: false, code: "STT_UNAVAILABLE" };
  const text = (opts.transcript ?? update.text ?? "").trim();
  if (!text) return { accepted: false, code: "EMPTY" };
  const result = processCommand({
    text,
    requestId: `tg-${update.updateId}`,
    session,
    now: opts.now,
    stateDir: opts.stateDir,
  });
  return { accepted: true, result };
}
