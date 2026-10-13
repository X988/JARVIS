import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configuredPublicHosts, configuredPublicOrigins, originOf, requestOriginAllowed } from "./public-origin.ts";

describe("public origin", () => {
  it("normalizes a trailing slash and drops a non-http URL", () => {
    assert.equal(originOf(" https://192.168.0.184:9443/ "), "https://192.168.0.184:9443");
    assert.equal(originOf("file:///tmp/x"), null);
    assert.equal(originOf("not a url"), null);
  });

  it("reads the canonical URL and extra trusted origins", () => {
    const env = {
      BETTER_AUTH_URL: "https://192.168.0.184:9443/",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://jarvis.lan:9443, https://192.168.0.184:9443",
    } as NodeJS.ProcessEnv;
    assert.deepEqual(configuredPublicOrigins(env), [
      "https://192.168.0.184:9443",
      "https://jarvis.lan:9443",
    ]);
    assert.deepEqual(configuredPublicHosts(env), ["192.168.0.184:9443", "jarvis.lan:9443"]);
  });

  it("accepts the proxy origin and rejects a foreign one", () => {
    const env = { BETTER_AUTH_URL: "https://192.168.0.184:9443" } as NodeJS.ProcessEnv;
    const allowed = new Request("http://127.0.0.1:8095/api/commands", {
      headers: { origin: "https://192.168.0.184:9443" },
    });
    assert.equal(requestOriginAllowed(allowed, env), true);

    const forwarded = new Request("http://127.0.0.1:8095/api/commands", {
      headers: {
        origin: "https://192.168.0.184:9443",
        "x-forwarded-host": "192.168.0.184:9443",
      },
    });
    assert.equal(requestOriginAllowed(forwarded, {}), true);

    const foreign = new Request("http://127.0.0.1:8095/api/commands", {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(requestOriginAllowed(foreign, {}), false);
    assert.equal(requestOriginAllowed(new Request("http://127.0.0.1/api/commands"), {}), true);
  });
});
