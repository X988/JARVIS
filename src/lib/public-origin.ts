/**
 * Public browser origins for a reverse proxy (LAN IP, custom HTTPS port).
 *
 * Better Auth also reads `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`
 * itself. JARVIS CSRF compares the browser `Origin` host with the request host,
 * which diverges when Caddy terminates TLS and Vite sees 127.0.0.1. These
 * helpers keep that check aligned with the origin the operator actually opened.
 */

export function originOf(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Normalized `http(s)://host[:port]` values from the public-URL env vars. */
export function configuredPublicOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.split(",")) {
      const origin = originOf(part);
      if (origin && !out.includes(origin)) out.push(origin);
    }
  };
  push(env.BETTER_AUTH_URL);
  push(env.BETTER_AUTH_TRUSTED_ORIGINS);
  return out;
}

export function configuredPublicHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return configuredPublicOrigins(env).map((origin) => new URL(origin).host);
}

/**
 * CSRF origin check. No `Origin` header is allowed (non-browser and same tests).
 * A present origin must match the request host, `X-Forwarded-Host`, or a host
 * configured in `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS`.
 */
export function requestOriginAllowed(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).host);
  } catch {
    /* request url without a host cannot satisfy the check by itself */
  }
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) allowed.add(forwarded);
  for (const host of configuredPublicHosts(env)) allowed.add(host);
  return allowed.has(originHost);
}
