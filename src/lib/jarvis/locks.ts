import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function lockDirectory(): string {
  return process.env.JARVIS_LOCK_DIR || path.join(os.tmpdir(), "jarvis-locks");
}

export function acquireLock(key: string, owner: string, ttlMs = 30 * 60 * 1000, dir = lockDirectory()): boolean {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, key.replace(/[^a-z0-9:_-]/gi, "_"));
  if (fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < ttlMs) return false;
    fs.unlinkSync(file);
  }
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeFileSync(fd, JSON.stringify({ owner, at: Date.now() }));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(key: string, dir = lockDirectory()): void {
  const file = path.join(dir, key.replace(/[^a-z0-9:_-]/gi, "_"));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export type LockReason = "held" | "NOT_CONFIGURED" | "ADAPTER_DISABLED";

export type LockOutcome = { ok: true } | { ok: false; reason: LockReason };

export interface LockProvider {
  readonly id: "file" | "redis";
  acquire(key: string, owner: string, ttlMs?: number): LockOutcome;
  release(key: string): void;
}

export class FileLockProvider implements LockProvider {
  readonly id = "file" as const;
  private readonly dir: string;

  constructor(dir = lockDirectory()) {
    this.dir = dir;
  }

  acquire(key: string, owner: string, ttlMs = 30 * 60 * 1000): LockOutcome {
    return acquireLock(key, owner, ttlMs, this.dir) ? { ok: true } : { ok: false, reason: "held" };
  }

  release(key: string): void {
    releaseLock(key, this.dir);
  }
}

/**
 * Production should use Redis or a Postgres advisory lock across hosts.
 * This class does not open a socket: without `JARVIS_REDIS_URL` the status is
 * NOT_CONFIGURED, and with a URL it still refuses the lock (ADAPTER_DISABLED)
 * so a missing client cannot look like a granted lock.
 */
export class RedisLockProvider implements LockProvider {
  readonly id = "redis" as const;
  private readonly url: string | undefined;

  constructor(url = process.env.JARVIS_REDIS_URL) {
    this.url = url;
  }

  acquire(_key: string, _owner: string, _ttlMs?: number): LockOutcome {
    if (!this.url) return { ok: false, reason: "NOT_CONFIGURED" };
    return { ok: false, reason: "ADAPTER_DISABLED" };
  }

  release(): void {}
}

export function createLockProvider(stateDir?: string, env: NodeJS.ProcessEnv = process.env): LockProvider {
  if (env.JARVIS_LOCK_BACKEND === "redis") return new RedisLockProvider(env.JARVIS_REDIS_URL);
  return new FileLockProvider(stateDir ?? lockDirectory());
}
