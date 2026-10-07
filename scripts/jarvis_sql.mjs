import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function out(code, detail) {
  process.stdout.write(JSON.stringify({ code, detail }));
}

function finish(code, detail) {
  out(code, detail);
  try {
    connection.close();
  } catch {
    // Already closed.
  }
  setTimeout(() => process.exit(0), 20);
}

function envInt(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function backupPath(root, name) {
  const file = `${name}.bak`;
  if (/^\\\\[^\\]+\\[^\\]+/.test(root) || /^[A-Za-z]:[\\/]/.test(root)) {
    return path.win32.join(root, file);
  }
  return path.join(path.resolve(root), file);
}

const mode = process.argv[2];
const name = process.argv[3] ?? "";
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
  out("NOT_CONFIGURED", "Имя базы не из inventory.");
  process.exit(0);
}

const host = process.env.JARVIS_SQL_HOST ?? "";
const user = process.env.JARVIS_SQL_USER ?? "";
const password = process.env.JARVIS_SQL_PASSWORD ?? "";
const port = Number(process.env.JARVIS_SQL_PORT || 1433);
if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  out("CREDENTIAL_UNAVAILABLE", "Нет корректных host, port, user или password. Запрос не отправлялся.");
  process.exit(0);
}

let tedious;
try {
  tedious = require("tedious");
} catch {
  out("ADAPTER_DISABLED", "Пакет tedious не установлен. Запрос не отправлялся.");
  process.exit(0);
}

const backupDir = process.env.JARVIS_SQL_BACKUP_DIR ?? "";
let backupFile = "";
if (mode === "backup") {
  if (!backupDir) {
    out("NOT_CONFIGURED", "Каталог копии не задан. BACKUP не отправлялся.");
    process.exit(0);
  }
  backupFile = backupPath(backupDir, name);
} else if (!["health", "database-size", "sessions", "blocking", "backup-status"].includes(mode)) {
  out("NOT_CONFIGURED", "Неизвестный SQL-режим.");
  process.exit(0);
}

const connectTimeout = envInt("JARVIS_SQL_CONNECT_TIMEOUT_MS", 5_000, 1_000, 60_000);
const requestTimeout =
  mode === "backup"
    ? envInt("JARVIS_SQL_BACKUP_TIMEOUT_MS", 3_600_000, 10_000, 7_200_000)
    : envInt("JARVIS_SQL_HEALTH_TIMEOUT_MS", 15_000, 1_000, 120_000);

const connection = new tedious.Connection({
  server: host,
  authentication: { type: "default", options: { userName: user, password } },
  options: {
    port,
    database: "master",
    encrypt: process.env.JARVIS_SQL_ENCRYPT !== "0",
    trustServerCertificate: process.env.JARVIS_SQL_TRUST_CERT === "1",
    connectTimeout,
    requestTimeout,
  },
});

function query(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const request = new tedious.Request(sql, (error) => (error ? reject(error) : resolve(rows)));
    for (const [key, value] of parameters) request.addParameter(key, tedious.TYPES.NVarChar, value);
    request.on("row", (columns) => {
      const row = {};
      for (const column of columns) row[column.metadata.colName] = column.value;
      rows.push(row);
    });
    connection.execSql(request);
  });
}

async function databaseState() {
  const rows = await query("SELECT state_desc FROM sys.databases WHERE name = @name", [["name", name]]);
  return String(rows[0]?.state_desc ?? "");
}

async function activeBackupOrRestore() {
  const rows = await query(
    "SELECT COUNT_BIG(*) AS active_count FROM sys.dm_exec_requests WHERE database_id = DB_ID(@name) AND (command LIKE 'BACKUP%' OR command LIKE 'RESTORE%')",
    [["name", name]],
  );
  return Number(rows[0]?.active_count ?? 0);
}

async function backupAndVerify() {
  const state = await databaseState();
  if (state !== "ONLINE") {
    return finish(
      "PRECONDITION_FAILED",
      state ? `state_desc=${state}; BACKUP не запускался.` : "База не найдена; BACKUP не запускался.",
    );
  }

  const active = await activeBackupOrRestore();
  if (!Number.isFinite(active) || active > 0) {
    return finish(
      "PRECONDITION_FAILED",
      "Для базы уже выполняется BACKUP/RESTORE либо состояние нельзя подтвердить. Новый BACKUP не запускался.",
    );
  }

  await query(`BACKUP DATABASE [${name}] TO DISK = @path WITH CHECKSUM`, [["path", backupFile]]);
  const header = await query("RESTORE HEADERONLY FROM DISK = @path", [["path", backupFile]]);
  if (!Array.isArray(header) || header.length === 0) {
    return finish("VERIFICATION_FAILED", "BACKUP завершился, но HEADERONLY не подтвердил backup set.");
  }
  await query("RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM", [["path", backupFile]]);
  return finish("OK", `Копия ${backupFile} создана с CHECKSUM; HEADERONLY и VERIFYONLY прошли.`);
}


async function databaseSize() {
  const rows = await query(
    "SELECT COALESCE(SUM(CAST(size AS bigint)) * 8192, 0) AS total_bytes FROM sys.master_files WHERE database_id = DB_ID(@name)",
    [["name", name]],
  );
  const bytes = Number(rows[0]?.total_bytes ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return finish("VERIFICATION_FAILED", "Размер базы не подтверждён.");
  return finish("OK", `database=${name}; total_bytes=${Math.trunc(bytes)}`);
}

async function sessionStatus() {
  const rows = await query(
    "SELECT COUNT_BIG(*) AS session_count FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND database_id = DB_ID(@name)",
    [["name", name]],
  );
  const count = Number(rows[0]?.session_count ?? -1);
  if (!Number.isFinite(count) || count < 0) return finish("VERIFICATION_FAILED", "Сессии не подтверждены.");
  return finish("OK", `database=${name}; user_sessions=${Math.trunc(count)}`);
}

async function blockingStatus() {
  const rows = await query(
    "SELECT COUNT_BIG(*) AS blocking_count FROM sys.dm_exec_requests WHERE database_id = DB_ID(@name) AND blocking_session_id <> 0",
    [["name", name]],
  );
  const count = Number(rows[0]?.blocking_count ?? -1);
  if (!Number.isFinite(count) || count < 0) return finish("VERIFICATION_FAILED", "Блокировки не подтверждены.");
  return finish("OK", `database=${name}; blocked_requests=${Math.trunc(count)}`);
}

async function backupStatus() {
  const rows = await query(
    "SELECT TOP (1) backup_finish_date, backup_size, has_backup_checksums FROM msdb.dbo.backupset WHERE database_name = @name AND type = 'D' ORDER BY backup_finish_date DESC",
    [["name", name]],
  );
  const row = rows[0];
  if (!row?.backup_finish_date) return finish("VERIFICATION_FAILED", "Полный backup в msdb не найден.");
  const stamp = row.backup_finish_date instanceof Date
    ? row.backup_finish_date.toISOString()
    : String(row.backup_finish_date);
  const bytes = Number(row.backup_size ?? 0);
  const checksum = Boolean(row.has_backup_checksums);
  return finish("OK", `database=${name}; last_full_backup=${stamp}; bytes=${Number.isFinite(bytes) ? Math.trunc(bytes) : 0}; checksum=${checksum}`);
}

connection.on("connect", (error) => {
  if (error) {
    finish("CONNECT_FAILED", "SQL Server не принял соединение. Запрос не выполнен.");
    return;
  }
  const job =
    mode === "health"
      ? databaseState().then((state) => {
          if (state === "ONLINE") finish("OK", "state_desc=ONLINE");
          else finish("VERIFICATION_FAILED", state ? `state_desc=${state}` : "База не найдена.");
        })
      : mode === "backup"
        ? backupAndVerify()
        : mode === "database-size"
          ? databaseSize()
          : mode === "sessions"
            ? sessionStatus()
            : mode === "blocking"
              ? blockingStatus()
              : backupStatus();
  job.catch(() => finish("VERIFICATION_FAILED", "SQL read/backup/verification завершились ошибкой. Успех не подменяется."));
});

connection.connect();
