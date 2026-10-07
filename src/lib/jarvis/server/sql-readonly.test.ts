import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SQLExecutor } from "./adapters.ts";
import { runbookById } from "./runbooks.ts";

describe("SQL fixed read-only runbooks", () => {
  it("registers only server-owned diagnostic SQL runbooks", () => {
    for (const id of ["sql.database.size", "sql.sessions", "sql.blocking", "sql.backup.status"]) {
      const book = runbookById(id);
      assert.ok(book);
      assert.equal(book?.mutates, false);
      assert.equal(book?.executor, "sql");
      assert.equal(book?.risk, 0);
    }
  });

  it("does not expose an arbitrary SQL runbook", () => {
    assert.equal(runbookById("sql.query"), null);
    const result = new SQLExecutor().execute({
      runbook: "sql.query",
      target: "utp",
      mode: "real",
      parameters: { sql: "DROP DATABASE utp" },
    });
    assert.notEqual(result.code, "OK");
  });

  it("keeps backup verification and diagnostic statements fixed in the server script", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, "../../../../scripts/jarvis_sql.mjs"), "utf8");
    assert.match(source, /BACKUP DATABASE \[\$\{name\}\].*WITH CHECKSUM/);
    assert.match(source, /RESTORE HEADERONLY/);
    assert.match(source, /RESTORE VERIFYONLY.*WITH CHECKSUM/);
    assert.match(source, /sys\.master_files/);
    assert.match(source, /sys\.dm_exec_sessions/);
    assert.match(source, /sys\.dm_exec_requests/);
    assert.match(source, /msdb\.dbo\.backupset/);
    assert.doesNotMatch(source, /process\.argv\[4\].*sql/i);
  });
});
