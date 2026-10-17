import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanSourceText, scanWorkflowText } from "./security-policy-scan.mjs";

describe("security policy static scan", () => {
  it("flags shell and transport safety regressions", () => {
    assert.deepEqual(scanSourceText("exec(userInput)"), []);
    assert.deepEqual(
      scanSourceText('import { exec } from "node:child_process"\nexec(userInput)'),
      ["child-process-exec"],
    );
    assert.deepEqual(scanSourceText("child_process.exec(userInput)"), ["child-process-exec"]);
    assert.deepEqual(scanSourceText("spawn('x', [], { shell: true })"), ["shell-true"]);
    assert.deepEqual(
      scanSourceText("const option = 'StrictHostKeyChecking=no'"),
      ["ssh-hostkey-disabled"],
    );
    assert.deepEqual(
      scanSourceText("https.request({ rejectUnauthorized: false })"),
      ["tls-verification-disabled"],
    );
  });

  it("flags direct main pushes but accepts server-owned spawn arrays", () => {
    assert.deepEqual(scanSourceText("git push origin main"), ["direct-main-push"]);
    assert.deepEqual(
      scanSourceText('spawnSync("ssh", ["-o", "StrictHostKeyChecking=yes"])'),
      [],
    );
  });

  it("requires immutable action SHAs and rejects pull_request_target", () => {
    assert.deepEqual(
      scanWorkflowText("steps:\n  - uses: actions/checkout@v7"),
      ["mutable-action-ref"],
    );
    assert.deepEqual(
      scanWorkflowText(
        "steps:\n  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      ),
      [],
    );
    assert.deepEqual(
      scanWorkflowText("on:\n  pull_request_target:\n"),
      ["pull-request-target"],
    );
  });
});
