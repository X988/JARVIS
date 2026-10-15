export type JarvisRole = "admin" | "operator" | "viewer" | "none";

export type Session = {
  id: string;
  accountId: string;
  role: JarvisRole;
  expiresAt: number;
  channel?: "web" | "telegram" | "voice" | "agent" | "gateway" | "test";
};

export function isJarvisRole(value: string): value is JarvisRole {
  return value === "admin" || value === "operator" || value === "viewer" || value === "none";
}

/** Read diagnostics. `none` is not a session that can call the API. */
export function canRead(role: JarvisRole | undefined): boolean {
  return role === "admin" || role === "operator" || role === "viewer";
}

/** Mutations, approvals and voice/agent execution. Viewers stay read-only. */
export function canExecute(role: JarvisRole | undefined): boolean {
  return role === "admin" || role === "operator";
}

export function sessionUsable(session: Session | null, now = Date.now()): session is Session {
  return Boolean(session && Number.isFinite(session.expiresAt) && session.expiresAt > now);
}

/**
 * Test-header auth is a dev/CI hook. Production never honors it, even if
 * `JARVIS_TEST_AUTH=1` was copied into the environment by mistake.
 */
export function allowTestAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.JARVIS_TEST_AUTH === "1";
}

export function roleForTestActor(actor: string): JarvisRole {
  if (actor === "admin1" || actor === "operator2") return "operator";
  if (actor === "root") return "admin";
  if (actor === "viewer1") return "viewer";
  return "none";
}

export function testSession(accountId: "admin1" | "stranger" | "viewer1" | "operator2" | "root", now = Date.now()): Session {
  return {
    id: "test-" + accountId,
    accountId,
    role: roleForTestActor(accountId),
    expiresAt: now + 60 * 60_000,
    channel: "test",
  };
}
