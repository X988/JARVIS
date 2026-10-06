import { randomUUID } from "node:crypto";
import { takeToken } from "../rate-limit.ts";
import { adapterStatus } from "./adapters.ts";
import { processCommand } from "./pipeline.ts";
import { ACCOUNTS, accountById, devLoginAllowed, issueSession, newCsrf, openSession, sessionSecret, type Session } from "./session.ts";

function stateDir(): string {
  return process.env.JARVIS_STATE_DIR || `${process.cwd()}/data`;
}

function secure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}

function readCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const header = request.headers.get("cookie");
  if (!header) return out;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    out[name] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function setCookie(name: string, value: string, httpOnly: boolean, isSecure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=28800; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${isSecure ? "; Secure" : ""}`;
}

function json(body: unknown, code: number, cookies: string[]): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status: code, headers });
}

function sessionOf(request: Request): Session | null {
  const token = readCookies(request).jarvis_session;
  if (!token) return null;
  return openSession(token);
}

export function executionMode(): "dry-run" | "mock" | "real" {
  const raw = process.env.EXECUTION_MODE;
  if (raw === "real" || raw === "mock") return raw;
  return "dry-run";
}

function status(code: string): number {
  if (code === "OK") return 200;
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "APPROVAL_REQUIRED") return 202;
  if (code === "APPROVAL_EXPIRED" || code === "APPROVAL_MISMATCH") return 409;
  if (code === "TARGET_NOT_FOUND" || code === "RUNBOOK_NOT_FOUND") return 404;
  if (code === "SCHEMA_INVALID") return 400;
  if (code === "EXECUTION_DISABLED" || code === "NOT_CONFIGURED") return 503;
  return 403;
}

export async function handleSession(request: Request): Promise<Response> {
  const isSecure = secure(request);
  const cookies = readCookies(request);
  const csrf = cookies.jarvis_csrf || newCsrf();
  const heads = [setCookie("jarvis_csrf", csrf, false, isSecure)];
  if (request.method === "GET") {
    const session = sessionOf(request);
    return json(
      session
        ? { accountId: session.accountId, role: session.role, executionMode: executionMode(), adapters: adapterStatus(), monitoring: "NOT_CONFIGURED" }
        : { code: "AUTH_REQUIRED", executionMode: executionMode(), monitoring: "NOT_CONFIGURED" },
      session ? 200 : 401,
      heads,
    );
  }
  if (request.method !== "POST") return json({ code: "SCHEMA_INVALID" }, 405, heads);
  if (!cookies.jarvis_csrf || request.headers.get("x-jarvis-csrf") !== cookies.jarvis_csrf) {
    return json({ code: "AUTH_REQUIRED", verdict: "deny" }, 401, heads);
  }
  let body: { accountId?: string; password?: string; telegramId?: string };
  try {
    body = (await request.json()) as { accountId?: string; password?: string; telegramId?: string };
  } catch {
    return json({ code: "SCHEMA_INVALID", verdict: "deny" }, 400, heads);
  }
  const account =
    accountById(String(body.accountId ?? "")) ??
    ACCOUNTS.find((item) => body.telegramId && item.telegramId === body.telegramId) ??
    null;
  if (!account) return json({ code: "ACTOR_DENIED", verdict: "deny" }, 403, heads);
  if (!devLoginAllowed()) {
    const expected = process.env.JARVIS_ADMIN_PASSWORD;
    if (account.role !== "operator" || !expected || body.password !== expected) {
      return json({ code: "AUTH_REQUIRED", verdict: "deny" }, 401, heads);
    }
  }
  const issued = issueSession(account);
  heads.push(setCookie("jarvis_session", issued.token, true, isSecure));
  return json({ accountId: account.id, role: account.role, executionMode: executionMode(), monitoring: "NOT_CONFIGURED" }, 200, heads);
}

export async function handleCommand(request: Request): Promise<Response> {
  const isSecure = secure(request);
  const cookies = readCookies(request);
  const csrf = cookies.jarvis_csrf || newCsrf();
  const heads = [setCookie("jarvis_csrf", csrf, false, isSecure)];
  if (!sessionSecret()) return json({ code: "AUTH_REQUIRED", verdict: "deny" }, 401, heads);
  if (!cookies.jarvis_csrf || request.headers.get("x-jarvis-csrf") !== cookies.jarvis_csrf) {
    return json({ code: "AUTH_REQUIRED", verdict: "deny" }, 401, heads);
  }
  const session = sessionOf(request);
  if (!takeToken(`cmd:${session?.accountId ?? "anon"}`, 30, 60_000)) {
    return json({ code: "RATE_LIMIT", verdict: "deny" }, 429, heads);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ code: "SCHEMA_INVALID", verdict: "deny" }, 400, heads);
  }
  if (typeof body.text !== "string") return json({ code: "SCHEMA_INVALID", verdict: "deny" }, 400, heads);
  const forged: Record<string, unknown> = {};
  for (const key of ["risk", "policy", "role", "allowed", "runbook", "approved", "parameters"]) {
    if (key in body) forged[key] = body[key];
  }
  const result = processCommand({
    text: body.text,
    requestId: typeof body.requestId === "string" ? body.requestId : randomUUID(),
    session,
    stateDir: stateDir(),
    forged,
  });
  return json(result, status(result.code), heads);
}
