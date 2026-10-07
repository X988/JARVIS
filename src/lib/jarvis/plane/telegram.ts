import { processCommand, type PipelineResult } from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";

export type TelegramActor = { actorId: string; role: "operator" | "none" };

export type TelegramUpdate = {
  updateId: number;
  userId: number;
  username?: string;
  text?: string;
  voiceFileId?: string;
  documentName?: string;
  documentFileId?: string;
  documentSize?: number;
  imageFileId?: string;
  forwardedFromId?: number;
  replyTo?: string;
  progress?: "typing";
};

export type TelegramOutcome =
  | { accepted: false; code: "ACTOR_DENIED" | "STT_UNAVAILABLE" | "EMPTY" }
  | { accepted: true; result: PipelineResult };

export function actorsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, TelegramActor> {
  const raw = env.JARVIS_TELEGRAM_ACTORS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const actors: Record<string, TelegramActor> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!/^[1-9]\d*$/.test(id)) continue;
      const row = value as Partial<TelegramActor>;
      if ((row.role !== "operator" && row.role !== "none") || !row.actorId) continue;
      actors[id] = { actorId: row.actorId, role: row.role };
    }
    return actors;
  } catch {
    return {};
  }
}

export function sessionForTelegram(
  userId: number,
  actors: Record<string, TelegramActor>,
  now = Date.now(),
): Session | null {
  const actor = actors[String(userId)];
  if (!actor || actor.role !== "operator") return null;
  return {
    id: `tg-${userId}`,
    accountId: actor.actorId,
    role: "operator",
    expiresAt: now + 15 * 60_000,
    channel: "telegram",
  };
}

export function telegramContext(update: TelegramUpdate): string {
  const bits = [
    update.replyTo ? `reply:${update.replyTo}` : "",
    update.forwardedFromId ? `forward:${update.forwardedFromId}` : "",
    update.documentName ? `file:${update.documentName}` : "",
    update.imageFileId ? "image" : "",
    update.progress ?? "",
  ].filter(Boolean);
  return bits.join(" ");
}

export function acceptTelegram(
  update: TelegramUpdate,
  opts: { stateDir: string; actors?: Record<string, TelegramActor>; now?: Date; transcript?: string | null },
): TelegramOutcome {
  const actors = opts.actors ?? actorsFromEnv();
  const session = sessionForTelegram(update.userId, actors, opts.now?.getTime());
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
