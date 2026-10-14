import fs from "node:fs";
import path from "node:path";

/**
 * Filesystem directory for the embedded PGLite database, or undefined to keep
 * the in-memory preview database. LAN installs without `DATABASE_URL` must set
 * `JARVIS_PGLITE_DIR` or email accounts disappear on process restart.
 */
export function pgliteDataDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.JARVIS_PGLITE_DIR?.trim();
  if (!raw) return undefined;
  const dir = path.resolve(raw);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
