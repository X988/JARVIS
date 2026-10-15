import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { appendAudit, auditFile } from "../audit-log.ts";
import { testSession } from "../server/session.ts";
import { readGatewayAudit } from "./audit-reader.ts";

it("protects the unified audit from anonymous, expired and non-admin readers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-view-"));
  try {
    for (const session of [null, testSession("viewer1"), testSession("admin1"), { ...testSession("root"), expiresAt: 0 }]) {
      assert.deepEqual(readGatewayAudit(session, dir), { forbidden: true, records: [] });
    }
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it("reads redacted gateway rows without changing the chain and refuses tampering", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-view-"));
  try {
    appendAudit({ at: new Date().toISOString(), executionId: "read-test", actor: "ops", action: "check", verdict: "allow", channel: "web", target: "mail01", risk: 0 }, dir);
    const before = fs.readFileSync(auditFile(dir), "utf8");
    const result = readGatewayAudit(testSession("root"), dir);
    assert.equal(result.forbidden, false);
    assert.equal(result.records[0]?.actorName, "ops");
    assert.equal(result.records[0]?.role, "—");
    assert.equal(fs.readFileSync(auditFile(dir), "utf8"), before);
    const tampered = JSON.parse(before);
    tampered.action = "changed";
    fs.writeFileSync(auditFile(dir), JSON.stringify(tampered) + "\n");
    assert.throws(() => readGatewayAudit(testSession("root"), dir), /AUDIT_INTEGRITY/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
