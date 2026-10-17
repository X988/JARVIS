#!/usr/bin/env node
/**
 * Fixed PostgreSQL probes. No arbitrary SQL from the client.
 * Modes: health | sessions | locks | size | status
 */
import pg from "pg";
const { Client } = pg;

const mode = process.argv[2];
const database = process.argv[3] || process.env.JARVIS_POSTGRES_DATABASE || "";

const host = process.env.JARVIS_POSTGRES_HOST;
const user = process.env.JARVIS_POSTGRES_USER;
const password = process.env.JARVIS_POSTGRES_PASSWORD;
const port = Number(process.env.JARVIS_POSTGRES_PORT || 5432);

if (!host || !user || !password) {
  console.log(JSON.stringify({ code: "CREDENTIAL_UNAVAILABLE", detail: "JARVIS_POSTGRES_* not set" }));
  process.exit(0);
}

const queries = {
  health: "SELECT 1 AS ok",
  sessions: "SELECT count(*) AS sessions FROM pg_stat_activity",
  locks: "SELECT count(*) AS locks FROM pg_locks",
  size: "SELECT pg_database_size($1) AS bytes",
  status: "SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) AS uptime_seconds",
};

const sql = queries[mode];
if (!sql) {
  console.log(JSON.stringify({ code: "SCHEMA_INVALID", detail: "unknown mode" }));
  process.exit(0);
}

const client = new Client({ host, user, password, port, database: database || undefined });
try {
  await client.connect();
  const res = await client.query(sql, mode === "size" ? [database] : []);
  console.log(JSON.stringify({ code: "OK", detail: JSON.stringify(res.rows).slice(0, 500) }));
} catch (err) {
  console.log(JSON.stringify({ code: "VERIFICATION_FAILED", detail: String(err.message).slice(0, 200) }));
} finally {
  await client.end().catch(() => {});
}
