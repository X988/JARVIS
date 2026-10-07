const BLOCKED = /login|signin|oauth|2fa|payment|checkout|admin\/change|credential|password|deploy|restart|delete|write|edit/i;

export type BrowserPlan =
  | { code: "READ"; url: string; method: "GET" | "HEAD"; maxBytes: number }
  | { code: "DENY"; reason: string };

export type BrowserRead = {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
};

export function browserIntent(action: string): { code: "READ" | "DENY" } {
  if (BLOCKED.test(action) || action === "change" || action === "pay") return { code: "DENY" };
  if (action === "read") return { code: "READ" };
  return { code: "DENY" };
}

function allowHosts(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.JARVIS_BROWSER_ALLOW_HOSTS ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function maxBytes(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.JARVIS_BROWSER_MAX_BYTES ?? 2 * 1024 * 1024);
  return Number.isFinite(raw)
    ? Math.max(16 * 1024, Math.min(10 * 1024 * 1024, Math.trunc(raw)))
    : 2 * 1024 * 1024;
}

export function browserPlan(
  rawUrl: string,
  action = "read",
  env: NodeJS.ProcessEnv = process.env,
  method: "GET" | "HEAD" = "GET",
): BrowserPlan {
  if (browserIntent(action).code !== "READ") return { code: "DENY", reason: "browser action запрещён" };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { code: "DENY", reason: "URL некорректен" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { code: "DENY", reason: "разрешены только HTTP/HTTPS" };
  }
  if (url.username || url.password || url.hash) {
    return { code: "DENY", reason: "credentials/fragment в URL запрещены" };
  }
  if (BLOCKED.test(url.pathname)) {
    return { code: "DENY", reason: "опасный browser path запрещён" };
  }
  const allowed = allowHosts(env);
  if (!allowed.has(url.hostname.toLowerCase())) {
    return { code: "DENY", reason: "hostname отсутствует в JARVIS_BROWSER_ALLOW_HOSTS" };
  }
  return { code: "READ", url: url.toString(), method, maxBytes: maxBytes(env) };
}

export async function readBrowserUrl(
  rawUrl: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    action?: string;
  } = {},
): Promise<BrowserRead | { ok: false; code: "DENY" | "FETCH_FAILED"; reason: string }> {
  const env = options.env ?? process.env;
  const plan = browserPlan(rawUrl, options.action ?? "read", env);
  if (plan.code === "DENY") return { ok: false, code: "DENY", reason: plan.reason };
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(plan.url, {
      method: plan.method,
      redirect: "error",
      credentials: "omit",
      headers: { accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
    });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > plan.maxBytes) {
      return { ok: false, code: "FETCH_FAILED", reason: "response exceeds limit" };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > plan.maxBytes) {
      return { ok: false, code: "FETCH_FAILED", reason: "response exceeds limit" };
    }
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      text: buffer.toString("utf8"),
    };
  } catch {
    return { ok: false, code: "FETCH_FAILED", reason: "read-only fetch failed" };
  }
}

export function browserMaySubmitCredentials(): false {
  return false;
}
