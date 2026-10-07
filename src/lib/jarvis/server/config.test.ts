import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configProblems, readiness } from "./config.ts";

describe("config", () => {
  it("rejects a deprecated name instead of reading it", () => {
    const problems = configProblems({ JARVIS_MAILCOW_COMPOSE_FILE: "/opt/mailcow/compose.yaml" });
    assert.match(problems.join("\n"), /JARVIS_MAILCOW_COMPOSE/);
    assert.equal(readiness({ JARVIS_PROFILE: "demo", JARVIS_AUDIT_HTTP: "http://127.0.0.1/audit" }, { dumpPresent: true }).ok, false);
  });

  it("requires a target map or fallback host for enabled host adapters", () => {
    const ssh = configProblems({ JARVIS_SSH_ENABLED: "1" });
    assert.match(ssh.join("\n"), /JARVIS_SSH_TARGETS_JSON|JARVIS_SSH_HOST/);
    const win = configProblems({ JARVIS_POWERSHELL_ENABLED: "1" });
    assert.match(win.join("\n"), /JARVIS_WINDOWS_TARGETS_JSON|JARVIS_WINDOWS_HOST/);
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

  it("keeps demo ready without live hosts and keeps production-infra red", () => {
    assert.equal(readiness({ JARVIS_PROFILE: "demo" }, { dumpPresent: true }).ok, true);
    const names = [
      "JARVIS_WINDOWS_TARGETS_JSON",
      "JARVIS_WINDOWS_USER",
      "JARVIS_WINDOWS_PASSWORD",
      "JARVIS_PWSH_BIN",
      "JARVIS_SSH_TARGETS_JSON",
      "JARVIS_SSH_USER",
      "JARVIS_SSH_BIN",
      "JARVIS_SQL_HOST",
      "JARVIS_SQL_USER",
      "JARVIS_SQL_PASSWORD",
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
    process.env.JARVIS_WINDOWS_TARGETS_JSON = '{"dc01":"dc01.example"}';
    process.env.JARVIS_WINDOWS_USER = "DOMAIN\\jarvis-read";
    process.env.JARVIS_WINDOWS_PASSWORD = "test-only";
    process.env.JARVIS_PWSH_BIN = "/definitely/missing/pwsh";
    process.env.JARVIS_SSH_TARGETS_JSON = '{"mail01":"mail01.example"}';
    process.env.JARVIS_SSH_USER = "jarvis-read";
    process.env.JARVIS_SSH_BIN = "/definitely/missing/ssh";
    process.env.JARVIS_SQL_HOST = "sql01.example";
    process.env.JARVIS_SQL_USER = "read";
    delete process.env.JARVIS_SQL_PASSWORD;
    try {
      const infra = readiness({ JARVIS_PROFILE: "production-infra" }, { dumpPresent: true });
      assert.equal(infra.ok, false);
      assert.equal(infra.adapters.powershell, "ADAPTER_DISABLED");
      assert.equal(infra.adapters.ssh, "ADAPTER_DISABLED");
      assert.equal(infra.adapters.sql, "CREDENTIAL_UNAVAILABLE");
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
