/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker exposes ONE shared
 * "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`.
 *
 * The client secret is NOT stored in the repository. It is read only from the
 * environment: a per-app `GROK_AUTH_CLIENT_SECRET` (deployed) or the shared
 * `GROK_PREVIEW_CLIENT_SECRET` (live preview). When neither is set, broker
 * sign-in (Google/X via the Grok broker) is disabled; local email/password and
 * session enforcement are unaffected.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/** Read an env var, treating empty/whitespace as unset. */
function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** Broker OAuth client id: per-app `GROK_AUTH_CLIENT_ID`, else the shared preview id. */
export function brokerClientId(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, "GROK_AUTH_CLIENT_ID") ?? PREVIEW_CLIENT_ID;
}

/** Broker OAuth client secret from env only. `undefined` disables broker sign-in. */
export function brokerClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return envValue(env, "GROK_AUTH_CLIENT_SECRET") ?? envValue(env, "GROK_PREVIEW_CLIENT_SECRET");
}

/** True when broker (Google/X) sign-in can be offered: auth on and a secret in env. */
export function brokerOAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VITE_AUTH_ENABLED?.trim() !== "false" && Boolean(brokerClientSecret(env));
}

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
