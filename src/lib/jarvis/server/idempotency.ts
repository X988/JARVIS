import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";

type Pending = { state: "pending"; at: number };
type Done<T> = { state: "done"; value: T };

function file(dir: string): string {
  return path.join(dir, "idempotency.json");
}

function readMap(dir: string): Record<string, unknown> {
  const target = file(dir);
  if (!fs.existsSync(target)) return {};
  return JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>;
}

function writeMap(dir: string, all: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = file(dir);
  const next = `${target}.tmp`;
  fs.writeFileSync(next, JSON.stringify(all));
  fs.renameSync(next, target);
}

function doneValue<T>(slot: unknown): T | undefined {
  if (slot && typeof slot === "object" && (slot as Done<T>).state === "done") return (slot as Done<T>).value;
  if (slot && typeof slot === "object" && (slot as Pending).state === "pending") return undefined;
  return slot as T;
}

function isPending(slot: unknown): slot is Pending {
  return Boolean(slot && typeof slot === "object" && (slot as Pending).state === "pending");
}

export function rememberRequest<T>(dir: string, requestId: string, produce: () => T): { duplicate: boolean; value: T } {
  const claimed = withStateLock(dir, () => {
    const all = readMap(dir);
    const current = all[requestId];
    const ready = doneValue<T>(current);
    if (ready !== undefined && !isPending(current)) return { kind: "done" as const, value: ready };
    if (isPending(current) && Date.now() - current.at < 30_000) return { kind: "wait" as const };
    all[requestId] = { state: "pending", at: Date.now() } satisfies Pending;
    writeMap(dir, all);
    return { kind: "mine" as const };
  });
  if (claimed.kind === "done") return { duplicate: true, value: claimed.value };
  if (claimed.kind === "wait") {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      const found = withStateLock(dir, () => doneValue<T>(readMap(dir)[requestId]));
      if (found !== undefined) return { duplicate: true, value: found };
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
    throw new Error("idempotency wait timeout");
  }
  try {
    const value = produce();
    withStateLock(dir, () => {
      const all = readMap(dir);
      all[requestId] = { state: "done", value } satisfies Done<T>;
      writeMap(dir, all);
    });
    return { duplicate: false, value };
  } catch (error) {
    withStateLock(dir, () => {
      const all = readMap(dir);
      if (isPending(all[requestId])) delete all[requestId];
      writeMap(dir, all);
    });
    throw error;
  }
}
