export type { Actor, Role } from "./types.ts";
import type { Actor, Role } from "./types.ts";

export const DEMO_ACTORS: Actor[] = [
  { id: "admin1", name: "admin1", role: "admin", allowed: true, telegramId: 100842 },
  { id: "operator1", name: "operator1", role: "operator", allowed: true, telegramId: 100900 },
  { id: "viewer1", name: "viewer", role: "viewer", allowed: true, telegramId: 100901 },
  { id: "stranger", name: "чужой аккаунт", role: "viewer", allowed: false, telegramId: 0 },
];

export function canApprove(role: Role): boolean {
  return role === "admin" || role === "operator";
}

export function parseOperators(raw: string | undefined): Actor[] | null {
  if (!raw?.trim()) return null;
  const actors: Actor[] = [];
  for (const part of raw.split(",")) {
    const [id, role, name, telegram] = part.split(":").map((item) => item.trim());
    if (!id || !name) continue;
    if (role !== "admin" && role !== "operator" && role !== "viewer") continue;
    const telegramId = Number(telegram ?? "0");
    actors.push({
      id,
      name,
      role,
      allowed: true,
      telegramId: Number.isFinite(telegramId) ? telegramId : 0,
    });
  }
  return actors.length > 0 ? actors : null;
}

export function resolveActor(id: string, operators: Actor[] | null): Actor | null {
  const list = operators ?? DEMO_ACTORS;
  return list.find((actor) => actor.id === id) ?? null;
}
