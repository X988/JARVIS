import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./server/state-lock.ts";

type Bucket = Record<string, number[]>;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function stateDir(): string {
  return process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data");
}

function stateFile(dir: string): string {
  return path.join(dir, "rate.json");
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(raw);
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback;
}

function validKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    !FORBIDDEN_KEYS.has(key) &&
    !/[\u0000-\u001F\u007F]/u.test(key)
  );
}

function readBucket(target: string): Bucket {
  if (!fs.existsSync(target)) return Object.create(null) as Bucket;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch {
    throw new Error("rate-limit state is invalid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("rate-limit state has invalid shape");
  }

  const bucket = Object.create(null) as Bucket;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!validKey(key) || !Array.isArray(value)) {
      throw new Error("rate-limit state contains an invalid bucket");
    }
    const stamps: number[] = [];
    for (const stamp of value) {
      if (
        typeof stamp !== "number" ||
        !Number.isFinite(stamp) ||
        !Number.isInteger(stamp) ||
        stamp < 0
      ) {
        throw new Error("rate-limit state contains an invalid timestamp");
      }
      stamps.push(stamp);
    }
    bucket[key] = stamps;
  }
  return bucket;
}

function atomicWrite(target: string, bucket: Bucket): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(bucket), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function cleanup(
  bucket: Bucket,
  now: number,
  retentionMs: number,
): void {
  for (const [key, stamps] of Object.entries(bucket)) {
    const retained = stamps.filter(
      (stamp) => stamp <= now && now - stamp < retentionMs,
    );
    if (retained.length === 0) delete bucket[key];
    else bucket[key] = retained;
  }
}

export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (!validKey(key)) throw new Error("invalid rate-limit key");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
    throw new Error("invalid rate-limit limit");
  }
  if (!Number.isInteger(windowMs) || windowMs < 1 || windowMs > 30 * 24 * 60 * 60 * 1000) {
    throw new Error("invalid rate-limit window");
  }
  if (!Number.isFinite(now) || !Number.isInteger(now) || now < 0) {
    throw new Error("invalid rate-limit clock");
  }

  const dir = stateDir();
  const target = stateFile(dir);
  const retentionMs = Math.max(
    windowMs,
    boundedInteger(
      process.env.JARVIS_RATE_LIMIT_RETENTION_MS,
      24 * 60 * 60 * 1000,
      60_000,
      30 * 24 * 60 * 60 * 1000,
    ),
  );
  const maxBuckets = boundedInteger(
    process.env.JARVIS_RATE_LIMIT_MAX_BUCKETS,
    10_000,
    100,
    100_000,
  );

  return withStateLock(dir, () => {
    const bucket = readBucket(target);
    cleanup(bucket, now, retentionMs);

    const current = bucket[key] ?? [];
    const fresh = current.filter((stamp) => stamp <= now && now - stamp < windowMs);
    bucket[key] = fresh;

    if (fresh.length >= limit) {
      atomicWrite(target, bucket);
      return false;
    }

    if (!(key in bucket) && Object.keys(bucket).length >= maxBuckets) {
      atomicWrite(target, bucket);
      return false;
    }

    fresh.push(now);
    bucket[key] = fresh;
    atomicWrite(target, bucket);
    return true;
  });
}
