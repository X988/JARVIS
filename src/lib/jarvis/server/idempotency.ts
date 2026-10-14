import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";

type Pending = {
  state: "pending";
  at: number;
  pid?: number;
  owner?: string;
};
type Done<T> = { state: "done"; at?: number; value: T };

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const STORAGE_KEY = /^[a-f0-9]{64}:[A-Za-z0-9._:-]{1,160}$/;
const LEGACY_KEY = /^[A-Za-z0-9._:-]{1,225}$/;
const OWNER_ID = /^[a-f0-9-]{36}$/;

function file(dir: string): string {
  return path.join(dir, "idempotency.json");
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

export function validRequestId(value: string): boolean {
  return (
    REQUEST_ID.test(value) &&
    value !== "__proto__" &&
    value !== "prototype" &&
    value !== "constructor"
  );
}

function validActorId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 8_192 &&
    !value.includes(String.fromCharCode(0))
  );
}

export function actorRequestStorageKey(
  actorId: string,
  requestId: string,
): string {
  if (!validActorId(actorId)) throw new Error("invalid actor id");
  if (!validRequestId(requestId)) throw new Error("invalid request id");
  const actorHash = createHash("sha256").update(actorId, "utf8").digest("hex");
  return `${actorHash}:${requestId}`;
}

function validStoredKey(value: string): boolean {
  // Legacy keys are accepted for migration compatibility. New writes always
  // hash actorId and therefore never persist it in the storage key.
  return STORAGE_KEY.test(value) || LEGACY_KEY.test(value);
}

function isPending(slot: unknown): slot is Pending {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
  const candidate = slot as Partial<Pending>;
  const legacyOwner = candidate.pid === undefined && candidate.owner === undefined;
  const owned =
    Number.isInteger(candidate.pid) &&
    Number(candidate.pid) > 0 &&
    typeof candidate.owner === "string" &&
    OWNER_ID.test(candidate.owner);
  return (
    candidate.state === "pending" &&
    typeof candidate.at === "number" &&
    Number.isFinite(candidate.at) &&
    candidate.at >= 0 &&
    (legacyOwner || owned)
  );
}

function isDone(slot: unknown): slot is Done<unknown> {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
  const candidate = slot as { state?: unknown; at?: unknown; value?: unknown };
  return (
    candidate.state === "done" &&
    Object.prototype.hasOwnProperty.call(candidate, "value") &&
    (candidate.at === undefined ||
      (typeof candidate.at === "number" &&
        Number.isFinite(candidate.at) &&
        candidate.at >= 0))
  );
}

function readMap(dir: string): Record<string, unknown> {
  const target = file(dir);
  if (!fs.existsSync(target)) {
    return Object.create(null) as Record<string, unknown>;
  }

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
  for (const [key, slot] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
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
    fs.writeFileSync(next, JSON.stringify(all), {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(next, target);
  } finally {
    fs.rmSync(next, { force: true });
  }
}

function pendingRecoverable(
  slot: Pending,
  now: number,
  legacyStaleMs: number,
): boolean {
  if (slot.pid === undefined || slot.owner === undefined) {
    return now - slot.at >= legacyStaleMs;
  }

  try {
    process.kill(slot.pid, 0);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return true;
    if (code === "EPERM") return false;
    return now - slot.at >= legacyStaleMs;
  }
}

function cleanupMap(
  all: Record<string, unknown>,
  now: number,
  retentionMs: number,
  legacyStaleMs: number,
): void {
  for (const [key, slot] of Object.entries(all)) {
    if (isDone(slot)) {
      // Legacy done records do not have a timestamp. Keep them rather than
      // guessing their age; all new records are timestamped and bounded.
      if (slot.at !== undefined && now - slot.at > retentionMs) delete all[key];
      continue;
    }
    if (
      isPending(slot) &&
      now - slot.at > retentionMs &&
      pendingRecoverable(slot, now, legacyStaleMs)
    ) {
      delete all[key];
    }
  }
}

function doneResult<T>(
  slot: unknown,
): { found: true; value: T } | { found: false } {
  return isDone(slot)
    ? { found: true, value: slot.value as T }
    : { found: false };
}

export function rememberRequest<T>(
  dir: string,
  actorId: string,
  requestId: string,
  produce: () => T,
): { duplicate: boolean; value: T } {
  const storageKey = actorRequestStorageKey(actorId, requestId);
  const owner = randomUUID();
  const retentionMs = boundedInteger(
    process.env.JARVIS_IDEMPOTENCY_RETENTION_MS,
    30 * 24 * 60 * 60 * 1000,
    60_000,
    365 * 24 * 60 * 60 * 1000,
  );
  const legacyStaleMs = boundedInteger(
    process.env.JARVIS_IDEMPOTENCY_LEGACY_PENDING_STALE_MS,
    30_000,
    5_000,
    24 * 60 * 60 * 1000,
  );
  const waitMs = boundedInteger(
    process.env.JARVIS_IDEMPOTENCY_WAIT_MS,
    10_000,
    50,
    60_000,
  );
  const maxRecords = boundedInteger(
    process.env.JARVIS_IDEMPOTENCY_MAX_RECORDS,
    50_000,
    100,
    100_000,
  );

  const claim = (): { kind: "mine" } | { kind: "wait" } | {
    kind: "done";
    value: T;
  } =>
    withStateLock(dir, () => {
      const now = Date.now();
      const all = readMap(dir);
      cleanupMap(all, now, retentionMs, legacyStaleMs);
      const current = all[storageKey];
      const ready = doneResult<T>(current);
      if (ready.found) {
        writeMap(dir, all);
        return { kind: "done" as const, value: ready.value };
      }
      if (
        isPending(current) &&
        !pendingRecoverable(current, now, legacyStaleMs)
      ) {
        writeMap(dir, all);
        return { kind: "wait" as const };
      }
      if (
        !Object.prototype.hasOwnProperty.call(all, storageKey) &&
        Object.keys(all).length >= maxRecords
      ) {
        throw new Error("idempotency state capacity reached");
      }
      all[storageKey] = {
        state: "pending",
        at: now,
        pid: process.pid,
        owner,
      } satisfies Pending;
      writeMap(dir, all);
      return { kind: "mine" as const };
    });

  let claimed = claim();
  if (claimed.kind === "done") {
    return { duplicate: true, value: claimed.value };
  }

  if (claimed.kind === "wait") {
    const started = Date.now();
    while (Date.now() - started < waitMs) {
      const state = withStateLock(dir, () => {
        const current = readMap(dir)[storageKey];
        const ready = doneResult<T>(current);
        if (ready.found) return { kind: "done" as const, value: ready.value };
        if (
          isPending(current) &&
          pendingRecoverable(current, Date.now(), legacyStaleMs)
        ) {
          return { kind: "recover" as const };
        }
        return { kind: "wait" as const };
      });
      if (state.kind === "done") {
        return { duplicate: true, value: state.value };
      }
      if (state.kind === "recover") {
        claimed = claim();
        if (claimed.kind === "done") {
          return { duplicate: true, value: claimed.value };
        }
        if (claimed.kind === "mine") break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
    if (claimed.kind !== "mine") {
      throw new Error("idempotency wait timeout");
    }
  }

  try {
    const value = produce();
    withStateLock(dir, () => {
      const all = readMap(dir);
      const current = all[storageKey];
      if (
        !isPending(current) ||
        current.owner !== owner ||
        current.pid !== process.pid
      ) {
        throw new Error("idempotency ownership lost");
      }
      all[storageKey] = {
        state: "done",
        at: Date.now(),
        value,
      } satisfies Done<T>;
      writeMap(dir, all);
    });
    return { duplicate: false, value };
  } catch (error) {
    withStateLock(dir, () => {
      const all = readMap(dir);
      const current = all[storageKey];
      if (
        isPending(current) &&
        current.owner === owner &&
        current.pid === process.pid
      ) {
        delete all[storageKey];
        writeMap(dir, all);
      }
    });
    throw error;
  }
}
