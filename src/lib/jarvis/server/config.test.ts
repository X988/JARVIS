import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configProblems, readiness } from "./config.ts";

describe("config", () => {
  it("rejects a deprecated name instead of reading it", () => {
    const problems = configProblems({ JARVIS_MAILCOW_COMPOSE_FILE: "/opt/mailcow/compose.yaml" });
    assert.match(problems.join("\n"), /JARVIS_MAILCOW_COMPOSE/);
    assert.equal(readiness({ JARVIS_PROFILE: "demo", JARVIS_AUDIT_HTTP: "http://127.0.0.1/audit" }, { dumpPresent: true }).ok, false);
  });

  it("rejects an enabled adapter with an empty host", () => {
    const problems = configProblems({ JARVIS_SSH_ENABLED: "1" });
    assert.match(problems.join("\n"), /JARVIS_SSH_HOST/);
  });

  it("keeps demo ready without live hosts and keeps production-infra red", () => {
    assert.equal(readiness({ JARVIS_PROFILE: "demo" }, { dumpPresent: true }).ok, true);
    const previous = {
      host: process.env.JARVIS_WINDOWS_HOST,
      user: process.env.JARVIS_WINDOWS_USER,
      ssh: process.env.JARVIS_SSH_HOST,
      sshUser: process.env.JARVIS_SSH_USER,
      sql: process.env.JARVIS_SQL_HOST,
      sqlUser: process.env.JARVIS_SQL_USER,
    };
    process.env.JARVIS_WINDOWS_HOST = "dc01.example";
    process.env.JARVIS_WINDOWS_USER = "read";
    process.env.JARVIS_SSH_HOST = "mail01.example";
    process.env.JARVIS_SSH_USER = "read";
    process.env.JARVIS_SQL_HOST = "sql01.example";
    process.env.JARVIS_SQL_USER = "read";
    try {
      const infra = readiness({ JARVIS_PROFILE: "production-infra" }, { dumpPresent: true });
      assert.equal(infra.ok, false);
      assert.equal(infra.adapters.powershell, "ADAPTER_DISABLED");
      assert.equal(infra.adapters.ssh, "ADAPTER_DISABLED");
    } finally {
      for (const [key, value] of [
        ["JARVIS_WINDOWS_HOST", previous.host],
        ["JARVIS_WINDOWS_USER", previous.user],
        ["JARVIS_SSH_HOST", previous.ssh],
        ["JARVIS_SSH_USER", previous.sshUser],
        ["JARVIS_SQL_HOST", previous.sql],
        ["JARVIS_SQL_USER", previous.sqlUser],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
