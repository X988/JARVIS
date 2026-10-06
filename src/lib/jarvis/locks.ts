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
