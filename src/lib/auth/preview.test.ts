import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brokerClientId, brokerClientSecret, brokerOAuthEnabled, PREVIEW_CLIENT_ID } from "./preview.ts";

describe("broker OAuth credentials come only from env", () => {
  it("has no hardcoded secret and disables broker sign-in when unset", () => {
    assert.equal(brokerClientSecret({}), undefined);
    assert.equal(brokerClientSecret({ GROK_PREVIEW_CLIENT_SECRET: "   " }), undefined);
    assert.equal(brokerOAuthEnabled({}), false);
  });

  it("prefers the per-app secret and falls back to the preview secret from env", () => {
    assert.equal(brokerClientSecret({ GROK_AUTH_CLIENT_SECRET: "app", GROK_PREVIEW_CLIENT_SECRET: "prev" }), "app");
    assert.equal(brokerClientSecret({ GROK_PREVIEW_CLIENT_SECRET: "prev" }), "prev");
    assert.equal(brokerOAuthEnabled({ GROK_PREVIEW_CLIENT_SECRET: "prev" }), true);
    assert.equal(brokerOAuthEnabled({ GROK_PREVIEW_CLIENT_SECRET: "prev", VITE_AUTH_ENABLED: "false" }), false);
  });

  it("uses the per-app client id when provided", () => {
    assert.equal(brokerClientId({}), PREVIEW_CLIENT_ID);
    assert.equal(brokerClientId({ GROK_AUTH_CLIENT_ID: "app-id" }), "app-id");
  });
});
