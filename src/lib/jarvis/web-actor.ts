import { canRead, isJarvisRole, type JarvisRole } from "./server/session.ts";

export type WebRole = JarvisRole;
export type WebBinding = { actorId: string; role: WebRole };

function bindingOf(value: unknown): WebBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { actorId?: unknown; role?: unknown };
  if (typeof row.actorId !== "string" || !row.actorId.trim() || row.actorId.length > 128) return null;
  if (typeof row.role !== "string" || !isJarvisRole(row.role)) return null;
  return { actorId: row.actorId, role: row.role };
}

export function parseWebActors(raw: string | undefined): Record<string, WebBinding> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, WebBinding> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const binding = bindingOf(value);
      if (binding) out[id] = binding;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Map a Better Auth user id to a JARVIS actor. Missing entries are denied.
 * `JARVIS_ALLOW_ANY_AUTHENTICATED_DEV=1` promotes any signed-in user only
 * outside production — it is not a LAN bootstrap switch.
 */
export function bindWebUser(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): { binding: WebBinding | null; code: "OK" | "ACTOR_DENIED" } {
  let binding = parseWebActors(env.JARVIS_WEB_ACTORS_JSON)[userId] ?? null;
  if (!binding && env.NODE_ENV !== "production" && env.JARVIS_ALLOW_ANY_AUTHENTICATED_DEV === "1") {
    binding = { actorId: userId, role: "operator" };
  }
  if (!binding) return { binding: null, code: "ACTOR_DENIED" };
  return { binding, code: canRead(binding.role) ? "OK" : "ACTOR_DENIED" };
}

/** One-line JSON an admin can paste into `JARVIS_WEB_ACTORS_JSON`. */
export function webActorEnvSnippet(userId: string, actorId = "admin1"): string {
  return JSON.stringify({ [userId]: { actorId, role: "operator" } });
}
