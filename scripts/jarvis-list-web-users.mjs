#!/usr/bin/env node
/**
 * Print Better Auth user ids so an admin can fill JARVIS_WEB_ACTORS_JSON.
 *
 * Postgres (`DATABASE_URL`) can be read while the server is up. File-backed
 * PGLite (`JARVIS_PGLITE_DIR`) is single-process: stop JARVIS first. The
 * in-memory fallback is not visible from this process.
 *
 *   node scripts/jarvis-list-web-users.mjs
 */
import { pathToFileURL } from "node:url";
import pg from "pg";

const USER_SQL = 'select id, email, name, "createdAt" from "user" order by "createdAt"';

export function formatWebUsers(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return "Пользователей нет. Сначала зарегистрируйтесь на странице входа.\n";
  }
  const lines = ["id\temail\tname"];
  const map = {};
  for (const row of list) {
    const id = String(row?.id ?? "");
    const email = String(row?.email ?? "");
    const name = String(row?.name ?? "");
    lines.push(`${id}\t${email}\t${name}`);
    if (id) map[id] = { actorId: "admin1", role: "operator" };
  }
  lines.push("");
  lines.push("JARVIS_WEB_ACTORS_JSON (actorId — имя в журнале, role оставьте operator):");
  lines.push(JSON.stringify(map));
  return `${lines.join("\n")}\n`;
}

async function readPostgres(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(USER_SQL);
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function readPglite(dir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dir);
  try {
    await db.waitReady;
    const result = await db.query(USER_SQL);
    return result.rows;
  } finally {
    await db.close();
  }
}

export async function listWebUsers(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  const dir = env.JARVIS_PGLITE_DIR?.trim();
  if (databaseUrl) return readPostgres(databaseUrl);
  if (dir) return readPglite(dir);
  throw new Error(
    "Задайте DATABASE_URL или JARVIS_PGLITE_DIR. In-memory PGLite этого процесса скрипт не видит, и без каталога учётки пропадают при перезапуске.",
  );
}

async function main() {
  try {
    const rows = await listWebUsers();
    process.stdout.write(formatWebUsers(rows));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (/lock|already|EBUSY|directory/i.test(message)) {
      console.error("Если PGLite открыт сервером, остановите JARVIS и повторите. Либо возьмите user id с экрана ACTOR_DENIED.");
    }
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) await main();
