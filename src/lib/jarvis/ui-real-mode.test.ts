import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendAudit } from "./audit-log.ts";
import { inventoryNote, modeLabel, visibleSuggestions } from "./model.ts";
import { handleAuditList } from "./server/http.ts";

describe("real-mode UI labels", () => {
  it("shows only read-only quick chips outside mock", () => {
    const labels = visibleSuggestions("real").map((item) => item.label);
    for (const bad of ["Выключи ether2", "Ребут DC", "Почисти сервер", "Удали базу", "Push в main", "Служба 1С", "Backup utp"]) {
      assert.equal(labels.includes(bad), false, bad);
    }
    assert.ok(labels.includes("Загрузка роутера"));
    assert.ok(visibleSuggestions("mock").some((item) => item.label === "Ребут DC"));
  });

  it("never shows a bare DEMO in real mode", () => {
    assert.equal(modeLabel("real", "demo"), "REAL · профиль demo");
    assert.equal(modeLabel("real", "production-infra"), "REAL · production");
    assert.equal(modeLabel("mock", "demo"), "DEMO · mock");
    assert.doesNotMatch(inventoryNote("real", { ssh: "NOT_CONFIGURED", powershell: "NOT_CONFIGURED" }), /Демо-набор/);
    assert.match(inventoryNote("real", { ssh: "NOT_CONFIGURED", powershell: "NOT_CONFIGURED" }), /шаблон, серверы не подключены/);
  });
});

describe("GET /api/audit", () => {
  const withEnv = async (fn: () => Promise<void>) => {
    const prev = { JARVIS_TEST_AUTH: process.env.JARVIS_TEST_AUTH, JARVIS_STATE_DIR: process.env.JARVIS_STATE_DIR };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-api-"));
    appendAudit({ at: new Date().toISOString(), executionId: "x", actor: "admin1", action: "check", verdict: "allow", result: "OK", channel: "web" }, dir);
    process.env.JARVIS_TEST_AUTH = "1";
    process.env.JARVIS_STATE_DIR = dir;
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  const get = (actor?: string) =>
    handleAuditList(new Request("http://127.0.0.1/api/audit", { headers: actor ? { "x-jarvis-test-actor": actor } : {} }));

  it("401 without a session, 403 for operator/viewer, 200 with rows for admin", async () => {
    await withEnv(async () => {
      assert.equal((await get()).status, 401);
      const operator = await get("operator2");
      assert.equal(operator.status, 403);
      assert.match(((await operator.json()) as { reason: string }).reason, /роль operator/);
      assert.equal((await get("viewer1")).status, 403);
      assert.equal((await get("admin1")).status, 403); // test actor admin1 is an operator, despite the name
      const admin = await get("root");
      assert.equal(admin.status, 200);
      const body = (await admin.json()) as { records: unknown[] };
      assert.equal(body.records.length, 1);
    });
  });
});
