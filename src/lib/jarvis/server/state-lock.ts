import fs from "node:fs";
import path from "node:path";

const depth = new Map<string, number>();

function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function boundedMs(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
}

function recoverableLock(lock: string, staleMs: number): boolean {
  const ageMs = Date.now() - fs.statSync(lock).mtimeMs;
  const raw = fs.readFileSync(lock, "utf8").trim();
  const pid = Number(raw);

  if (!Number.isInteger(pid) || pid <= 0) {
    return ageMs > staleMs;
  }

  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return true;
    if (code === "EPERM") return false;
    return ageMs > staleMs;
  }
}

function acquire(root: string): number {
  const lock = path.join(root, "state.lock");
  const timeoutMs = boundedMs(process.env.JARVIS_STATE_LOCK_TIMEOUT_MS, 10_000, 100, 60_000);
  const staleMs = boundedMs(process.env.JARVIS_STATE_LOCK_STALE_MS, 30_000, 1_000, 10 * 60_000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeFileSync(fd, String(process.pid));
      return fd;
    } catch {
      try {
        if (recoverableLock(lock, staleMs)) fs.unlinkSync(lock);
      } catch {
        // The holder removed or replaced the lock between the checks.
      }
      pause(10);
    }
  }
  throw new Error("state lock timeout");
}

export function withStateLock<T>(dir: string, run: () => T): T {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const held = depth.get(root) ?? 0;
  if (held > 0) {
    depth.set(root, held + 1);
    try {
      return run();
    } finally {
      const next = (depth.get(root) ?? 1) - 1;
      if (next <= 0) depth.delete(root);
      else depth.set(root, next);
    }
  }

  const fd = acquire(root);
  depth.set(root, 1);
  try {
    return run();
  } finally {
    depth.delete(root);
    fs.closeSync(fd);
    fs.rmSync(path.join(root, "state.lock"), { force: true });
  }
}
