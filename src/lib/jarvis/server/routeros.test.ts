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
