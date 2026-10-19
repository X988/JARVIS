/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled for self-hosted LAN use. Sign-in forms call `authClient.signUp.email`
 * / `authClient.signIn.email` from `@/lib/auth/client`. Registration does not
 * grant an operator role: that still comes only from `JARVIS_WEB_ACTORS_JSON`.
 *
 * Registration is CLOSED by default. Open it only while creating the first
 * accounts with `JARVIS_EMAIL_SIGNUP=1` (also `true`, `on`, `yes`), then unset it
 * or set `0`. Sign-in of existing accounts stays available either way. Restart the process after
 * changing it — Better Auth reads `disableSignUp` when the server module loads,
 * and the `/api/auth` route checks the same flag on every request.
 *
 * Do NOT rewrite `server.ts` for a new auth method. `server.ts` only consumes
 * the flag, the signup lock, and `minPasswordLength` below.
 */
export const emailAndPasswordEnabled = true;

/** Shared by the login form and Better Auth. */
export const minPasswordLength = 10;

export function emailSignUpDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.JARVIS_EMAIL_SIGNUP?.trim().toLowerCase();
  return !(raw === "1" || raw === "true" || raw === "on" || raw === "yes");
}

/** True when this request is a Better Auth email registration call. */
export function isEmailSignUpRequest(url: string, method: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split("?")[0] ?? url;
  }
  return pathname.split("/").some((part) => part === "sign-up");
}
