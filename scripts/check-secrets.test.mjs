import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSensitiveTrackedPath, scanText } from "./check-secrets.mjs";

describe("repository secret scan", () => {
  it("detects high-confidence credentials without returning the credential value", () => {
    const token = "ghp_" + "A".repeat(40);
    const findings = scanText(`token=${token}`);
    assert.deepEqual(findings, ["github-pat"]);
    assert.equal(JSON.stringify(findings).includes(token), false);
  });

  it("detects private keys and common cloud API credentials", () => {
    const privateKeyMarker = "-----BEGIN " + "PRIVATE KEY-----\nredacted";
    assert.deepEqual(scanText(privateKeyMarker), ["private-key"]);
    assert.deepEqual(scanText("AKIA" + "A".repeat(16)), ["aws-access-key"]);
  });

  it("flags tracked secret files but permits committed env templates", () => {
    assert.equal(isSensitiveTrackedPath(".env"), true);
    assert.equal(isSensitiveTrackedPath("ops/.env.production"), true);
    assert.equal(isSensitiveTrackedPath(".env.example"), false);
    assert.equal(isSensitiveTrackedPath("certs/server.key"), true);
  });

  it("does not flag ordinary configuration text", () => {
    assert.deepEqual(scanText("JARVIS_SQL_PASSWORD is supplied by the runtime environment"), []);
  });
});
