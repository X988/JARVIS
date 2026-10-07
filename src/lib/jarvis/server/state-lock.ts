import fs from "node:fs";
import path from "node:path";

const depth = new Map<string, number>();

function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquire(root: string): number {
  const lock = path.join(root, "state.lock");
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeFileSync(fd, String(process.pid));
      return fd;
    } catch {
      try {
        const pid = Number(fs.readFileSync(lock, "utf8"));
        const stale = Date.now() - fs.statSync(lock).mtimeMs > 30_000;
        let alive = false;
        if (pid > 0) {
          try {
            process.kill(pid, 0);
            alive = true;
          } catch {
            alive = false;
          }
        }
        if (!alive || stale) fs.unlinkSync(lock);
      } catch {
        // The holder removed the lock between the checks.
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
