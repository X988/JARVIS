import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localAuthMessage } from "./local-auth-message.ts";

describe("local auth messages", () => {
  it("explains the LAN origin and closed registration failures", () => {
    assert.match(localAuthMessage({ code: "INVALID_ORIGIN" }), /BETTER_AUTH_URL/);
    assert.match(localAuthMessage({ code: "SIGNUP_DISABLED" }), /JARVIS_EMAIL_SIGNUP/);
    assert.match(localAuthMessage({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" }), /JARVIS_EMAIL_SIGNUP/);
    assert.match(localAuthMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }), /Неверная почта/);
    assert.match(localAuthMessage({ code: "PASSWORD_TOO_SHORT" }), /10/);
  });
});
