import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configProblems, readiness } from "./config.ts";
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

  it("reports production adapter configuration without probing live hosts", () => {
    const env = {
      JARVIS_PROFILE: "production-infra",
      JARVIS_WINDOWS_TARGETS_JSON: '{"dc01":"127.0.0.1"}',
      JARVIS_WINDOWS_USER: "DOMAIN\\jarvis-read",
      JARVIS_WINDOWS_PASSWORD: "test-only",
      JARVIS_PWSH_BIN: "/definitely/missing/pwsh",
      JARVIS_SSH_TARGETS_JSON: '{"mail01":"127.0.0.1"}',
      JARVIS_SSH_USER: "jarvis-read",
      JARVIS_SSH_BIN: "/definitely/missing/ssh",
      JARVIS_SQL_HOST: "127.0.0.1",
      JARVIS_SQL_USER: "read",
      JARVIS_SQL_PASSWORD: "test-only",
    };
    const infra = readiness(env, { dumpPresent: true });
    assert.equal(infra.ok, true);
    assert.equal(infra.adapters.powershell, "CONFIGURED_UNPROBED");
    assert.equal(infra.adapters.ssh, "CONFIGURED_UNPROBED");
    assert.equal(infra.adapters.sql, "CONFIGURED_UNPROBED");
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
  });
});
