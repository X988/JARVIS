import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runRouterOs } from "./routeros.ts";

describe("routeros REST adapter", () => {
  it("fails closed without credentials", () => {
    const result = runRouterOs({ runbook: "mikrotik.status", target: "rb5009", mode: "real" }, {});
    assert.equal(result.code, "NOT_CONFIGURED");
    assert.equal(result.called, false);
  });

  it("rejects unsupported runbooks before any network call", () => {
    const result = runRouterOs(
      { runbook: "server.health", target: "rb5009", mode: "real" },
      {
        JARVIS_MIKROTIK_HOST: "router.example",
        JARVIS_MIKROTIK_USER: "jarvis-read",
        JARVIS_MIKROTIK_PASSWORD: "secret",
      },
    );
    assert.equal(result.code, "NOT_CONFIGURED");
    assert.equal(result.called, false);
  });

  it("keeps extended diagnostics on a fixed allowlist", () => {
    const supported = [
      "mikrotik.status",
      "mikrotik.interfaces",
      "mikrotik.routes",
      "mikrotik.dhcp",
      "mikrotik.firewall.counters",
      "mikrotik.wan.status",
      "mikrotik.wireguard",
      "wireguard.status",
    ];
    for (const runbook of supported) {
      const result = runRouterOs(
        { runbook, target: runbook.includes("wireguard") ? "wg" : "rb5009", mode: "real" },
        {},
      );
      assert.notEqual(result.code, "OK");
    }
    const arbitrary = runRouterOs(
      { runbook: "mikrotik.command", target: "rb5009", mode: "real", parameters: { command: "/system reboot" } },
      {
        JARVIS_MIKROTIK_HOST: "router.example",
        JARVIS_MIKROTIK_USER: "jarvis-read",
        JARVIS_MIKROTIK_PASSWORD: "secret",
      },
    );
    assert.equal(arbitrary.code, "NOT_CONFIGURED");
  });

  it("treats an unreachable HTTPS endpoint as connection failure, not success", () => {
    const result = runRouterOs(
      { runbook: "mikrotik.status", target: "rb5009", mode: "real" },
      {
        JARVIS_MIKROTIK_HOST: "127.0.0.1",
        JARVIS_MIKROTIK_PORT: "1",
        JARVIS_MIKROTIK_USER: "jarvis-read",
        JARVIS_MIKROTIK_PASSWORD: "not-real",
        JARVIS_ROUTEROS_TIMEOUT_MS: "2000",
      },
    );
    assert.equal(result.code, "CONNECT_FAILED");
    assert.equal(result.called, false);
  });
});
