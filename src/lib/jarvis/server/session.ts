import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Account = {
  id: string;
  role: "operator" | "none";
  telegramId: string;
};

export const ACCOUNTS: Account[] = [
  { id: "admin1", role: "operator", telegramId: "100842" },
  { id: "stranger", role: "none", telegramId: "0" },
];

export type Session = {
  id: string;
  accountId: string;
  role: Account["role"];
  expiresAt: number;
};

export function sessionSecret(): string {
  const fromEnv = process.env.JARVIS_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return "";
  return "dev-only-session-secret";
}

export function devLoginAllowed(): boolean {
  if (process.env.JARVIS_ALLOW_DEV_LOGIN === "0") return false;
  if (process.env.NODE_ENV === "production") return process.env.JARVIS_ALLOW_DEV_LOGIN === "1";
  return true;
}

export function accountById(id: string): Account | null {
  return ACCOUNTS.find((item) => item.id === id) ?? null;
}

export function signValue(payload: string, secret = sessionSecret()): string {
  const body = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSigned(token: string, secret = sessionSecret()): string | null {
  if (!secret) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}

export function issueSession(account: Account, now = Date.now()): { session: Session; token: string } {
  const session: Session = {
    id: randomBytes(8).toString("hex"),
    accountId: account.id,
    role: account.role,
    expiresAt: now + 8 * 60 * 60 * 1000,
  };
  return { session, token: signValue(JSON.stringify(session)) };
}

export function openSession(token: string, now = Date.now()): Session | null {
  const raw = readSigned(token);
  if (!raw) return null;
  const session = JSON.parse(raw) as Session;
  if (!session.expiresAt || session.expiresAt < now) return null;
  const account = accountById(session.accountId);
  if (!account || account.role !== session.role) return null;
  return session;
}

export function newCsrf(): string {
  return randomBytes(16).toString("hex");
}
