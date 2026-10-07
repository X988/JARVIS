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
} else if (mode !== "health") {
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

function query(sql, parameters) {
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

connection.on("connect", (error) => {
  if (error) {
    finish("CONNECT_FAILED", "SQL Server не принял соединение. Запрос не выполнен.");
    return;
  }
  const job =
    mode === "health"
      ? query("SELECT state_desc FROM sys.databases WHERE name = @name", [["name", name]]).then((rows) => {
          const state = String(rows[0]?.state_desc ?? "");
          if (state === "ONLINE") finish("OK", "state_desc=ONLINE");
          else finish("VERIFICATION_FAILED", state ? `state_desc=${state}` : "База не найдена.");
        })
      : query(`BACKUP DATABASE [${name}] TO DISK = @path WITH CHECKSUM`, [["path", backupFile]])
          .then(() => query("RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM", [["path", backupFile]]))
          .then(() => finish("OK", `Копия ${backupFile} создана с CHECKSUM, VERIFYONLY прошёл.`));
  job.catch(() => finish("VERIFICATION_FAILED", "Запрос выполнен с ошибкой. Успех не подменяется."));
});

connection.connect();
