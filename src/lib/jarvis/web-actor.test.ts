import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindWebUser, webActorEnvSnippet } from "./web-actor.ts";

describe("web actors", () => {
  it("denies a signed-in user who is not in the map", () => {
    const result = bindWebUser("user-1", { JARVIS_WEB_ACTORS_JSON: "{}" });
    assert.equal(result.code, "ACTOR_DENIED");
    assert.equal(result.binding, null);
  });

  it("accepts an operator binding and denies role none", () => {
    const env = {
      JARVIS_WEB_ACTORS_JSON: JSON.stringify({
        "user-1": { actorId: "admin1", role: "operator" },
        "user-2": { actorId: "guest", role: "none" },
      }),
    };
    assert.equal(bindWebUser("user-1", env).code, "OK");
    assert.equal(bindWebUser("user-1", env).binding?.actorId, "admin1");
    assert.equal(bindWebUser("user-2", env).code, "ACTOR_DENIED");
    assert.equal(bindWebUser("user-2", env).binding?.role, "none");
  });

  it("does not promote LAN signups when the dev bypass is set in production", () => {
    const env = {
      NODE_ENV: "production",
      JARVIS_ALLOW_ANY_AUTHENTICATED_DEV: "1",
    };
    assert.equal(bindWebUser("user-1", env).code, "ACTOR_DENIED");
    const dev = bindWebUser("user-1", { JARVIS_ALLOW_ANY_AUTHENTICATED_DEV: "1" });
    assert.equal(dev.code, "OK");
    assert.equal(dev.binding?.actorId, "user-1");
  });

  it("prints a pasteable actor map", () => {
    assert.equal(
      webActorEnvSnippet("abc"),
      '{"abc":{"actorId":"admin1","role":"operator"}}',
    );
  });
});
