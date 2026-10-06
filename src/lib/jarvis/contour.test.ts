import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendAudit, externalSinkLabel, verifyAudit } from "./audit-log.ts";
import { FileLockProvider, RedisLockProvider, acquireLock, releaseLock } from "./locks.ts";
import { BslLanguageServerValidator, FallbackBslValidator, OneCDesignerValidator, checkBsl } from "./onec/bsl.ts";
import { FileOnecExecutor } from "./onec/executor.ts";
import { planGitFlow } from "./onec/git-flow.ts";
import { analyzeQuery } from "./onec/query.ts";
import { SQLExecutor, ServerProbeExecutor } from "./server/adapters.ts";
import { takeToken } from "./rate-limit.ts";
import { OPERATORS, evaluate } from "./model.ts";

const admin = OPERATORS[0];
const now = new Date("2026-10-06T12:00:00Z");

describe("policy", () => {
  it("denies drop even as a phrase", () => {
    const decision = evaluate("Удали базу utp", admin, now);
    assert.equal(decision.verdict, "deny");
  });

  it("denies a stranger", () => {
    const decision = evaluate("Проверь сервер", OPERATORS[1], now);
    assert.equal(decision.verdict, "deny");
  });

  it("denies 1C production edit", () => {
    const decision = evaluate("Создай управляемую форму в рабочей базе", admin, now);
    assert.equal(decision.verdict, "deny");
  });
});

describe("bsl and query", () => {
  it("flags Выполнить", () => {
    const report = checkBsl("Процедура А()\nВыполнить(\"1\");\nКонецПроцедуры");
    assert.equal(report.ok, false);
    assert.equal(report.adapter, "fallback");
    assert.equal(new FallbackBslValidator().check("Процедура А()\nКонецПроцедуры").ok, true);
    const language = new BslLanguageServerValidator().check("Процедура А()\nКонецПроцедуры");
    assert.equal(language.adapter, "not-configured");
    assert.equal(language.ok, false);
    assert.match(language.note, /NOT_CONFIGURED/);
    assert.equal(new OneCDesignerValidator().check("").adapter, "not-configured");
  });

  it("flags a dynamic query", () => {
    const report = analyzeQuery('ВЫБРАТЬ * ИЗ Регистр ВЫПОЛНИТЬ("ВЫБРАТЬ " + Поле)');
    assert.equal(report.ok, false);
  });
});

describe("executor", () => {
  it("does not write production", () => {
    const executor = new FileOnecExecutor(path.join(process.cwd(), "extensions", "JarvisDev"));
    const result = executor.create("module", "Новый", "production");
    assert.equal(result.code, "DENY");
  });

  it("reads the dumped module and refuses a path outside the dump", () => {
    const executor = new FileOnecExecutor(path.join(process.cwd(), "extensions", "JarvisDev"));
    const found = executor.readModule("CommonModules/jrvs_Разработка/Ext/Module.bsl", "test");
    assert.equal(found.ok, true);
    const escaped = executor.writeModule("../outside.bsl", "Функция А() Экспорт\nКонецФункции\n", "test");
    assert.equal(escaped.code, "DENY");
  });
});

describe("locks, audit, git", () => {
  it("second lock waits", () => {
    process.env.JARVIS_LOCK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-lock-"));
    assert.equal(acquireLock("backup:sql01:utp", "a"), true);
    assert.equal(acquireLock("backup:sql01:utp", "b"), false);
    releaseLock("backup:sql01:utp");
    assert.equal(acquireLock("backup:sql01:utp", "b"), true);
    const file = new FileLockProvider(process.env.JARVIS_LOCK_DIR);
    assert.equal(file.acquire("other", "a").ok, true);
    assert.deepEqual(file.acquire("other", "b"), { ok: false, reason: "held" });
    file.release("other");
    assert.deepEqual(new RedisLockProvider(undefined).acquire("k", "a"), { ok: false, reason: "NOT_CONFIGURED" });
    assert.deepEqual(new RedisLockProvider("redis://127.0.0.1:6379").acquire("k", "a"), { ok: false, reason: "ADAPTER_DISABLED" });
    assert.equal(externalSinkLabel({}), "NOT_CONFIGURED");
    assert.equal(externalSinkLabel({ JARVIS_AUDIT_HTTP_URL: "http://127.0.0.1/audit" }), "http:ADAPTER_DISABLED");
    const windows = process.env.JARVIS_WINDOWS_HOST;
    const ssh = process.env.JARVIS_SSH_HOST;
    const sqlHost = process.env.JARVIS_SQL_HOST;
    delete process.env.JARVIS_WINDOWS_HOST;
    delete process.env.JARVIS_SSH_HOST;
    delete process.env.JARVIS_SQL_HOST;
    try {
      const health = new ServerProbeExecutor().execute({ runbook: "server.health", target: "dc01", mode: "real" });
      const backup = new SQLExecutor().execute({ runbook: "sql.backup", target: "utp", mode: "real" });
      assert.equal(health.code, "NOT_CONFIGURED");
      assert.equal(health.called, false);
      assert.equal(backup.code, "NOT_CONFIGURED");
      assert.doesNotMatch(backup.detail, /BACKUP DATABASE|SELECT /);
    } finally {
      if (windows === undefined) delete process.env.JARVIS_WINDOWS_HOST;
      else process.env.JARVIS_WINDOWS_HOST = windows;
      if (ssh === undefined) delete process.env.JARVIS_SSH_HOST;
      else process.env.JARVIS_SSH_HOST = ssh;
      if (sqlHost === undefined) delete process.env.JARVIS_SQL_HOST;
      else process.env.JARVIS_SQL_HOST = sqlHost;
    }
  });

  it("keeps the audit chain", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-"));
    appendAudit({ at: "1", executionId: "a", actor: "admin1", action: "read", verdict: "allow" }, dir);
    appendAudit({ at: "2", executionId: "b", actor: "admin1", action: "drop", verdict: "deny" }, dir);
    assert.equal(verifyAudit(dir).ok, true);
  });

  it("limits a bucket", () => {
    process.env.JARVIS_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-rate-"));
    assert.equal(takeToken("login", 2, 1000, 1_000), true);
    assert.equal(takeToken("login", 2, 1000, 1_100), true);
    assert.equal(takeToken("login", 2, 1000, 1_200), false);
  });

  it("refuses push to main", () => {
    assert.equal(planGitFlow({ pushMain: true }).code, "DENY");
    assert.equal(planGitFlow({ pushMain: false }).steps.at(-1), "pr");
  });
});
