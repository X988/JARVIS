#!/usr/bin/env node
/**
 * Fixed MySQL probes. No arbitrary SQL from the client.
 * Modes: health | sessions | locks | size | status
 */
import mysql from "mysql2/promise";

const mode = process.argv[2];
const database = process.argv[3] || process.env.JARVIS_MYSQL_DATABASE || "";

const host = process.env.JARVIS_MYSQL_HOST;
const user = process.env.JARVIS_MYSQL_USER;
const password = process.env.JARVIS_MYSQL_PASSWORD;
const port = Number(process.env.JARVIS_MYSQL_PORT || 3306);

if (!host || !user || !password) {
  console.log(JSON.stringify({ code: "CREDENTIAL_UNAVAILABLE", detail: "JARVIS_MYSQL_* not set" }));
  process.exit(0);
}

const queries = {
  health: "SELECT 1 AS ok",
  sessions: "SHOW STATUS LIKE 'Threads_connected'",
  locks: "SELECT COUNT(*) AS locks FROM information_schema.innodb_trx",
  size: `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS mb FROM information_schema.tables WHERE table_schema = ?`,
  status: "SHOW STATUS LIKE 'Uptime'",
};

const sql = queries[mode];
if (!sql) {
  console.log(JSON.stringify({ code: "SCHEMA_INVALID", detail: "unknown mode" }));
  process.exit(0);
}

const conn = await mysql.createConnection({ host, user, password, port, database: database || undefined });
try {
  const [rows] = await conn.query(sql, mode === "size" ? [database] : []);
  console.log(JSON.stringify({ code: "OK", detail: JSON.stringify(rows).slice(0, 500) }));
} catch (err) {
  console.log(JSON.stringify({ code: "VERIFICATION_FAILED", detail: String(err.message).slice(0, 200) }));
} finally {
  await conn.end();
}
