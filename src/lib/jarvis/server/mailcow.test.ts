import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mailcowSshArgs, runMailcow } from "./mailcow.ts";

describe("mailcow read-only adapter", () => {
  it("builds only the fixed compose status and queue probe", () => {
    const args = mailcowSshArgs({
      JARVIS_DOCKER_HOST: "mail01.example",
      JARVIS_DOCKER_USER: "jarvis-read",
      JARVIS_MAILCOW_COMPOSE: "/opt/mailcow-dockerized/docker-compose.yml",
      JARVIS_SSH_KEY_FILE: "/run/secrets/mailcow_key",
    });
    assert.ok(args);
    const remote = args?.at(-1) ?? "";
    assert.match(remote, /docker compose/);
    assert.match(remote, /postqueue -p/);
    assert.doesNotMatch(remote, /restart|down|rm -f|docker exec .* sh/);
  });

  it("rejects a relative or injected compose path", () => {
    assert.equal(mailcowSshArgs({
      JARVIS_DOCKER_HOST: "mail01.example",
      JARVIS_DOCKER_USER: "jarvis-read",
      JARVIS_MAILCOW_COMPOSE: "docker-compose.yml; id",
    }), null);
  });

  it("fails closed when ssh is unavailable", () => {
    const result = runMailcow(
      { runbook: "mailcow.health", target: "mail01", mode: "real" },
      {
        JARVIS_DOCKER_HOST: "mail01.example",
        JARVIS_DOCKER_USER: "jarvis-read",
        JARVIS_MAILCOW_COMPOSE: "/opt/mailcow-dockerized/docker-compose.yml",
        JARVIS_SSH_BIN: "/definitely/missing/ssh",
      },
    );
    assert.equal(result.code, "ADAPTER_DISABLED");
    assert.equal(result.called, false);
  });
});
