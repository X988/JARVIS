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
import { onecValidationProbe, validateOnecExport, type ValidationRunner } from "./onec/validation.ts";
import { SQLExecutor, ServerProbeExecutor, probeRoute } from "./server/adapters.ts";
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

describe("1C layered validation", () => {
  it("stays FALLBACK_ONLY when no external validators are configured", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-val-"));
    const module = path.join(root, "Module.bsl");
    const source = "Процедура Проверка()\nКонецПроцедуры";
    fs.writeFileSync(module, source);
    const result = validateOnecExport(root, module, source, {});
    assert.equal(result.ok, true);
    assert.equal(result.level, "FALLBACK_ONLY");
    assert.equal(result.evidence.length, 1);
    assert.equal(onecValidationProbe({}).fallback, true);
  });

  it("raises validation level only after real wrapper success", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-val-"));
    const module = path.join(root, "Module.bsl");
    const source = "Процедура Проверка()\nКонецПроцедуры";
    fs.writeFileSync(module, source);
    const calls: Array<{ executable: string; args: string[] }> = [];
    const runner: ValidationRunner = (executable, args) => {
      calls.push({ executable, args });
      return { status: 0 };
    };
    const result = validateOnecExport(
      root,
      module,
      source,
      {
        JARVIS_BSL_LS_CHECK_BIN: "/opt/jarvis/check-bsl",
        JARVIS_1CV8_DESIGNER_CHECK_BIN: "/opt/jarvis/check-designer",
        JARVIS_ONEC_TEST_DB_CHECK_BIN: "/opt/jarvis/check-test-db",
      },
      runner,
    );
    assert.equal(result.ok, true);
    assert.equal(result.level, "TEST_DATABASE_VERIFIED");
    assert.deepEqual(result.evidence.map((item) => item.level), [
      "FALLBACK_ONLY",
      "BSL_LANGUAGE_SERVER",
      "DESIGNER_CHECK",
      "TEST_DATABASE_VERIFIED",
    ]);
    assert.equal(calls[0]?.args[0], module);
    assert.equal(calls[1]?.args[0], root);
    assert.equal(calls[2]?.args[0], root);
  });

  it("fails closed when a configured validator fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-val-"));
    const module = path.join(root, "Module.bsl");
    const source = "Процедура Проверка()\nКонецПроцедуры";
    fs.writeFileSync(module, source);
    const result = validateOnecExport(
      root,
      module,
      source,
      { JARVIS_BSL_LS_CHECK_BIN: "/opt/jarvis/check-bsl" },
      () => ({ status: 2 }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.level, "BSL_LANGUAGE_SERVER");
  });

  it("rolls a changed module back when external validation fails", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-exec-"));
    fs.writeFileSync(path.join(root, "Configuration.xml"), "<MetaDataObject><ChildObjects></ChildObjects></MetaDataObject>");
    const relative = path.join("CommonModules", "jrvs_Test", "Ext", "Module.bsl");
    const module = path.join(root, relative);
    fs.mkdirSync(path.dirname(module), { recursive: true });
    const before = "Процедура До()\nКонецПроцедуры\n";
    const after = "Процедура После()\nКонецПроцедуры\n";
    fs.writeFileSync(module, before);
    const executor = new FileOnecExecutor(root, {
      env: { JARVIS_BSL_LS_CHECK_BIN: "/opt/jarvis/check-bsl" },
      validationRunner: () => ({ status: 1 }),
    });
    const result = executor.writeModule(relative, after, "test");
    assert.equal(result.ok, false);
    assert.equal(result.code, "FAIL");
    assert.match(result.message, /откатан/);
    assert.equal(fs.readFileSync(module, "utf8"), before);
  });

  it("does not call external validators for production writes", () => {
    let calls = 0;
    const executor = new FileOnecExecutor(path.join(process.cwd(), "extensions", "JarvisDev"), {
      env: { JARVIS_BSL_LS_CHECK_BIN: "/opt/jarvis/check-bsl" },
      validationRunner: () => {
        calls += 1;
        return { status: 0 };
      },
    });
    const result = executor.writeModule("CommonModules/x/Ext/Module.bsl", "Процедура А()\nКонецПроцедуры", "production");
    assert.equal(result.code, "DENY");
    assert.equal(calls, 0);
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

  it("refuses BSL symlinks that escape the export root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-jail-"));
    const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-outside-")), "Outside.bsl");
    fs.writeFileSync(outside, "Процедура Снаружи()\nКонецПроцедуры\n");
    const link = path.join(root, "Escape.bsl");
    fs.symlinkSync(outside, link);

    const executor = new FileOnecExecutor(root);
    assert.equal(executor.readModule("Escape.bsl", "test").code, "NOT_FOUND");
    assert.equal(
      executor.writeModule("Escape.bsl", "Процедура Внутри()\nКонецПроцедуры\n", "test").code,
      "DENY",
    );
    assert.equal(fs.readFileSync(outside, "utf8"), "Процедура Снаружи()\nКонецПроцедуры\n");
  });

  it("fails closed when export search exceeds the configured traversal depth", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-1c-search-"));
    const deep = path.join(root, "a", "b");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "Target.xml"), "<MetaDataObject><Name>target</Name></MetaDataObject>");
    const executor = new FileOnecExecutor(root, { env: { JARVIS_ONEC_SEARCH_MAX_DEPTH: "1" } });
    const result = executor.find("target", "test");
    assert.equal(result.code, "FAIL");
    assert.match(result.message, /безопасным лимитом/);
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
    const windowsMap = process.env.JARVIS_WINDOWS_TARGETS_JSON;
    const windowsUser = process.env.JARVIS_WINDOWS_USER;
    const windowsPassword = process.env.JARVIS_WINDOWS_PASSWORD;
    const ssh = process.env.JARVIS_SSH_HOST;
    const sshMap = process.env.JARVIS_SSH_TARGETS_JSON;
    const sqlHost = process.env.JARVIS_SQL_HOST;
    delete process.env.JARVIS_WINDOWS_HOST;
    delete process.env.JARVIS_WINDOWS_TARGETS_JSON;
    delete process.env.JARVIS_WINDOWS_USER;
    delete process.env.JARVIS_WINDOWS_PASSWORD;
    delete process.env.JARVIS_SSH_HOST;
    delete process.env.JARVIS_SSH_TARGETS_JSON;
    delete process.env.JARVIS_SQL_HOST;
    try {
      const health = new ServerProbeExecutor().execute({ runbook: "server.health", target: "dc01", mode: "real" });
      const backup = new SQLExecutor().execute({ runbook: "sql.backup", target: "utp", mode: "real" });
      assert.equal(health.code, "NOT_CONFIGURED");
      assert.equal(health.called, false);
      assert.equal(backup.code, "NOT_CONFIGURED");
      assert.doesNotMatch(backup.detail, /BACKUP DATABASE|SELECT /);
      process.env.JARVIS_WINDOWS_HOST = "dc01.example";
      process.env.JARVIS_WINDOWS_USER = "jarvis-read";
      const mail = new ServerProbeExecutor().execute({ runbook: "server.health", target: "mail01", mode: "real" });
      const controller = new ServerProbeExecutor().execute({ runbook: "server.health", target: "dc01", mode: "real" });
      assert.equal(probeRoute("mail01"), "ssh");
      assert.equal(probeRoute("dc01"), "powershell");
      assert.equal(mail.code, "NOT_CONFIGURED");
      assert.match(mail.detail, /JARVIS_SSH_TARGETS_JSON/);
      assert.doesNotMatch(mail.detail, /WinRM/);
      assert.equal(controller.code, "CREDENTIAL_UNAVAILABLE");
      assert.match(controller.detail, /user\/password/);
      assert.doesNotMatch(controller.detail, /SSH/);
    } finally {
      if (windows === undefined) delete process.env.JARVIS_WINDOWS_HOST;
      else process.env.JARVIS_WINDOWS_HOST = windows;
      if (windowsMap === undefined) delete process.env.JARVIS_WINDOWS_TARGETS_JSON;
      else process.env.JARVIS_WINDOWS_TARGETS_JSON = windowsMap;
      if (windowsUser === undefined) delete process.env.JARVIS_WINDOWS_USER;
      else process.env.JARVIS_WINDOWS_USER = windowsUser;
      if (windowsPassword === undefined) delete process.env.JARVIS_WINDOWS_PASSWORD;
      else process.env.JARVIS_WINDOWS_PASSWORD = windowsPassword;
      if (ssh === undefined) delete process.env.JARVIS_SSH_HOST;
      else process.env.JARVIS_SSH_HOST = ssh;
      if (sshMap === undefined) delete process.env.JARVIS_SSH_TARGETS_JSON;
      else process.env.JARVIS_SSH_TARGETS_JSON = sshMap;
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
