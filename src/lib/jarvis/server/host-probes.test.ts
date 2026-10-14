import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { powershellScript, runSshProbe, runWindowsProbe, sshArgs, windowsTargetHost } from "./host-probes.ts";

describe("read-only host probes", () => {
  it("routes a Windows target by target id instead of one global host", () => {
    const env = {
      JARVIS_WINDOWS_TARGETS_JSON: JSON.stringify({ dc01: "dc01.example", srv1c01: "srv1c01.example" }),
      JARVIS_WINDOWS_HOST: "wrong.example",
    };
    assert.equal(windowsTargetHost("srv1c01", env), "srv1c01.example");
    assert.equal(windowsTargetHost("sql01", env), null);
  });

  it("builds SSH only from server-side target config and fixed read-only command", () => {
    const env = {
      JARVIS_SSH_TARGETS_JSON: JSON.stringify({ mail01: "mail01.example" }),
      JARVIS_SSH_USER: "jarvis-read",
      JARVIS_SSH_PORT: "22",
      JARVIS_SSH_KEY_FILE: "/run/secrets/jarvis_ssh",
    };
    const args = sshArgs({ runbook: "server.health", target: "mail01", mode: "real" }, env);
    assert.ok(args);
    assert.equal(args?.includes("jarvis-read@mail01.example"), true);
    assert.equal(args?.includes("/run/secrets/jarvis_ssh"), true);
    assert.match(args?.at(-1) ?? "", /\/proc\/uptime/);
    assert.doesNotMatch(args?.join(" ") ?? "", /rm -rf|sudo|curl/);
  });

  it("rejects an injected host before starting ssh", () => {
    const env = {
      JARVIS_SSH_TARGETS_JSON: JSON.stringify({ mail01: "mail01.example;touch /tmp/x" }),
      JARVIS_SSH_USER: "jarvis-read",
    };
    assert.equal(sshArgs({ runbook: "server.health", target: "mail01", mode: "real" }, env), null);
  });

  it("fails closed when ssh/pwsh clients are absent", () => {
    const ssh = runSshProbe(
      { runbook: "server.health", target: "mail01", mode: "real" },
      {
        JARVIS_SSH_TARGETS_JSON: JSON.stringify({ mail01: "mail01.example" }),
        JARVIS_SSH_USER: "jarvis-read",
        JARVIS_SSH_BIN: "/definitely/missing/ssh",
      },
    );
    assert.equal(ssh.code, "ADAPTER_DISABLED");
    const win = runWindowsProbe(
      { runbook: "server.health", target: "dc01", mode: "real" },
      {
        JARVIS_WINDOWS_TARGETS_JSON: JSON.stringify({ dc01: "dc01.example" }),
        JARVIS_WINDOWS_USER: "DOMAIN\\jarvis-read",
        JARVIS_WINDOWS_PASSWORD: "test-only-secret",
        JARVIS_PWSH_BIN: "/definitely/missing/pwsh",
      },
    );
    assert.equal(win.code, "ADAPTER_DISABLED");
  });

  it("keeps PowerShell remote code fixed and read-only", () => {
    const script = powershellScript();
    assert.match(script, /Get-CimInstance Win32_OperatingSystem/);
    assert.match(script, /Get-CimInstance Win32_LogicalDisk/);
    assert.doesNotMatch(script, /Remove-Item|Restart-Service|Stop-Service|Invoke-Expression/);
  });
});
