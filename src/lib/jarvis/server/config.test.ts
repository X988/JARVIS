import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configProblems, readiness } from "./config.ts";
import { recordAdapterProbe } from "./probe-status.ts";
import { componentStatus } from "./components.ts";

describe("config", () => {
  it("rejects a deprecated name instead of reading it", () => {
    const problems = configProblems({ JARVIS_MAILCOW_COMPOSE_FILE: "/opt/mailcow/compose.yaml" });
    assert.match(problems.join("\n"), /JARVIS_MAILCOW_COMPOSE/);
    assert.equal(
      readiness(
        { JARVIS_PROFILE: "demo", JARVIS_AUDIT_HTTP: "http://127.0.0.1/audit" },
        { dumpPresent: true },
      ).ok,
      false,
    );
  });

  it("requires a target map or fallback host for enabled host adapters", () => {
    assert.match(configProblems({ JARVIS_SSH_ENABLED: "1" }).join("\n"), /JARVIS_SSH_TARGETS_JSON|JARVIS_SSH_HOST/);
    assert.match(configProblems({ JARVIS_POWERSHELL_ENABLED: "1" }).join("\n"), /JARVIS_WINDOWS_TARGETS_JSON|JARVIS_WINDOWS_HOST/);
  });

  it("rejects an invalid target map and accepts a valid one with credentials", () => {
    assert.match(
      configProblems({ JARVIS_SSH_TARGETS_JSON: '{"mail01":"mail01;bad"}' }).join("\n"),
      /JARVIS_SSH_TARGETS_JSON/,
    );
    assert.deepEqual(
      configProblems({
        JARVIS_SSH_ENABLED: "1",
        JARVIS_SSH_TARGETS_JSON: '{"mail01":"mail01.example"}',
        JARVIS_SSH_USER: "jarvis-read",
      }),
      [],
    );
  });

  it("keeps production readiness red until required adapters have fresh live probes", () => {
    const env = {
      JARVIS_PROFILE: "production-infra",
      JARVIS_WINDOWS_TARGETS_JSON: '{"dc01":"127.0.0.1"}',
      JARVIS_WINDOWS_USER: "DOMAIN\\jarvis-read",
      JARVIS_WINDOWS_PASSWORD: "test-only",
      JARVIS_SSH_TARGETS_JSON: '{"mail01":"127.0.0.1"}',
      JARVIS_SSH_USER: "jarvis-read",
      JARVIS_SQL_HOST: "127.0.0.1",
      JARVIS_SQL_USER: "read",
      JARVIS_SQL_PASSWORD: "test-only",
      JARVIS_ADAPTER_PROBE_TTL_MS: "60000",
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ready-probe-"));
    const at = 1_000_000;
    const unprobed = readiness(env, { dumpPresent: true, stateDir: dir, now: at });
    assert.equal(unprobed.ok, false);
    assert.equal(unprobed.probes.powershell.status, "UNPROBED");
    assert.equal(unprobed.probes.ssh.status, "UNPROBED");
    assert.equal(unprobed.probes.sql.status, "UNPROBED");

    for (const adapter of ["powershell", "ssh", "sql"]) {
      recordAdapterProbe(dir, adapter, { called: true, code: "OK", detail: "verified" }, at);
    }
    const healthy = readiness(env, { dumpPresent: true, stateDir: dir, now: at + 1_000 });
    assert.equal(healthy.ok, true);
    assert.equal(healthy.probes.sql.status, "HEALTHY");

    const stale = readiness(env, { dumpPresent: true, stateDir: dir, now: at + 61_001 });
    assert.equal(stale.ok, false);
    assert.equal(stale.probes.sql.status, "UNPROBED");
    assert.equal(stale.probes.sql.reason, "PROBE_STALE");
  });

  it("fails production readiness closed when probe state is corrupted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ready-corrupt-"));
    fs.writeFileSync(path.join(dir, "adapter-probes.json"), "{broken");
    const env = {
      JARVIS_PROFILE: "production-infra",
      JARVIS_WINDOWS_HOST: "dc01.example",
      JARVIS_WINDOWS_USER: "DOMAIN\\jarvis-read",
      JARVIS_WINDOWS_PASSWORD: "test",
      JARVIS_SSH_HOST: "mail01.example",
      JARVIS_SSH_USER: "jarvis-read",
      JARVIS_SQL_HOST: "sql01.example",
      JARVIS_SQL_USER: "read",
      JARVIS_SQL_PASSWORD: "test",
    };
    const report = readiness(env, { stateDir: dir, now: 1_000_000 });
    assert.equal(report.ok, false);
    assert.equal(report.probes.sql.status, "UNAVAILABLE");
    assert.equal(report.probes.sql.reason, "STATE_CORRUPT");
  });

  it("keeps production readiness red when a required credential is absent", () => {
    const infra = readiness(
      {
        JARVIS_PROFILE: "production-infra",
        JARVIS_WINDOWS_TARGETS_JSON: '{"dc01":"dc01.example"}',
        JARVIS_WINDOWS_USER: "DOMAIN\\jarvis-read",
        JARVIS_WINDOWS_PASSWORD: "secret",
        JARVIS_SSH_TARGETS_JSON: '{"mail01":"mail01.example"}',
        JARVIS_SSH_USER: "jarvis-read",
        JARVIS_SQL_HOST: "sql01.example",
        JARVIS_SQL_USER: "read",
      },
      { dumpPresent: true },
    );
    assert.equal(infra.ok, false);
    assert.equal(infra.adapters.sql, "CREDENTIAL_UNAVAILABLE");
  });

  it("reports passive component status without requiring network probes", () => {
    const status = componentStatus({
      JARVIS_STATE_DIR: "/tmp/jarvis-component-test-does-not-need-network",
      JARVIS_TELEGRAM_ACTORS_JSON: '{"100842":{"actorId":"admin1","role":"operator"}}',
      JARVIS_TELEGRAM_TOKEN: "token-placeholder",
      JARVIS_TELEGRAM_WEBHOOK_SECRET: "secret-placeholder",
      JARVIS_REDIS_URL: "redis://example.invalid",
      DATABASE_URL: "postgres://example.invalid/jarvis",
      JARVIS_LLM_LOCAL: "1",
    });
    assert.equal(status.telegram.state, "CONFIGURED");
    assert.equal(status.redis.state, "CONFIGURED");
    assert.equal(status.database.state, "CONFIGURED");
    assert.equal(status.llm.state, "CONFIGURED");
    assert.equal(status.inventory.state, "OK");
    assert.equal(status.onecValidation.state, "DEGRADED");
    assert.match(status.onecValidation.detail, /level=FALLBACK_ONLY/);

    const onec = componentStatus({
      JARVIS_BSL_LS_CHECK_BIN: "/opt/jarvis/bin/check-bsl",
      JARVIS_1CV8_DESIGNER_CHECK_BIN: "/opt/jarvis/bin/check-designer",
      JARVIS_ONEC_TEST_DB_CHECK_BIN: "/opt/jarvis/bin/check-test-db",
    });
    assert.equal(onec.onecValidation.state, "CONFIGURED");
    assert.match(onec.onecValidation.detail, /level=TEST_DATABASE_VERIFIED/);
  });
});
