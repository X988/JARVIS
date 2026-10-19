import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailSignUpDisabled, isEmailSignUpRequest, minPasswordLength } from "./email-password.ts";

describe("email password policy", () => {
  it("keeps sign-up closed unless the env explicitly opens it", () => {
    assert.equal(emailSignUpDisabled({}), true);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "" }), true);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "maybe" }), true);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "1" }), false);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: " TRUE " }), false);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "yes" }), false);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "0" }), true);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: "false" }), true);
    assert.equal(emailSignUpDisabled({ JARVIS_EMAIL_SIGNUP: " OFF " }), true);
  });

  it("recognizes only the Better Auth sign-up path", () => {
    assert.equal(isEmailSignUpRequest("https://192.168.0.184:9443/api/auth/sign-up/email", "POST"), true);
    assert.equal(isEmailSignUpRequest("https://192.168.0.184:9443/api/auth/sign-in/email", "POST"), false);
    assert.equal(isEmailSignUpRequest("https://192.168.0.184:9443/api/auth/sign-up/email", "GET"), false);
    assert.equal(minPasswordLength, 10);
  });
});
