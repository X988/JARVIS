import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";

type Pending = { state: "pending"; at: number };
type Done<T> = { state: "done"; value: T };

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const STORAGE_KEY = /^[a-f0-9]{64}:[A-Za-z0-9._:-]{1,160}$/;
const LEGACY_KEY = /^[A-Za-z0-9._:-]{1,225}$/;

function file(dir: string): string {
  return path.join(dir, "idempotency.json");
}

export function validRequestId(value: string): boolean {
  return REQUEST_ID.test(value) && value !== "__proto__" && value !== "prototype" && value !== "constructor";
}

function validActorId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 8_192 &&
    !value.includes(String.fromCharCode(0))
  );
}

export function actorRequestStorageKey(actorId: string, requestId: string): string {
  if (!validActorId(actorId)) throw new Error("invalid actor id");
  if (!validRequestId(requestId)) throw new Error("invalid request id");
  const actorHash = createHash("sha256").update(actorId, "utf8").digest("hex");
  return `${actorHash}:${requestId}`;
}

function validStoredKey(value: string): boolean {
  // Legacy keys are accepted for read-only migration compatibility. New writes
  // always use actorRequestStorageKey and therefore never persist raw actor IDs.
  return STORAGE_KEY.test(value) || LEGACY_KEY.test(value);
}

function isPending(slot: unknown): slot is Pending {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
  const candidate = slot as Partial<Pending>;
  return candidate.state === "pending" && typeof candidate.at === "number" && Number.isFinite(candidate.at);
}

function isDone(slot: unknown): slot is Done<unknown> {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
  const candidate = slot as { state?: unknown; value?: unknown };
  return candidate.state === "done" && Object.prototype.hasOwnProperty.call(candidate, "value");
}

function readMap(dir: string): Record<string, unknown> {
  const target = file(dir);
  if (!fs.existsSync(target)) return Object.create(null) as Record<string, unknown>;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch {
    throw new Error("idempotency state is invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("idempotency state has invalid shape");
  }

  const out = Object.create(null) as Record<string, unknown>;
  for (const [key, slot] of Object.entries(parsed as Record<string, unknown>)) {
    if (!validStoredKey(key) || (!isPending(slot) && !isDone(slot))) {
      throw new Error("idempotency state contains an invalid entry");
    }
    out[key] = slot;
  }
  return out;
}

function writeMap(dir: string, all: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = file(dir);
  const next = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(next, JSON.stringify(all), { encoding: "utf8", flag: "wx" });
    fs.renameSync(next, target);
  } finally {
    fs.rmSync(next, { force: true });
  }
}

function doneValue<T>(slot: unknown): T | undefined {
  return isDone(slot) ? (slot.value as T) : undefined;
}

export function rememberRequest<T>(
  dir: string,
  actorId: string,
  requestId: string,
  produce: () => T,
): { duplicate: boolean; value: T } {
  const storageKey = actorRequestStorageKey(actorId, requestId);

  const claimed = withStateLock(dir, () => {
    const all = readMap(dir);
    const current = all[storageKey];
    const ready = doneValue<T>(current);
    if (ready !== undefined) return { kind: "done" as const, value: ready };
    if (isPending(current) && Date.now() - current.at < 30_000) return { kind: "wait" as const };
    all[storageKey] = { state: "pending", at: Date.now() } satisfies Pending;
    writeMap(dir, all);
    return { kind: "mine" as const };
  });

  if (claimed.kind === "done") return { duplicate: true, value: claimed.value };
  if (claimed.kind === "wait") {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      const found = withStateLock(dir, () => doneValue<T>(readMap(dir)[storageKey]));
      if (found !== undefined) return { duplicate: true, value: found };
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
    throw new Error("idempotency wait timeout");
  }

  try {
    const value = produce();
    withStateLock(dir, () => {
      const all = readMap(dir);
      all[storageKey] = { state: "done", value } satisfies Done<T>;
      writeMap(dir, all);
    });
    return { duplicate: false, value };
  } catch (error) {
    withStateLock(dir, () => {
      const all = readMap(dir);
      if (isPending(all[storageKey])) delete all[storageKey];
      writeMap(dir, all);
    });
    throw error;
  }
}
