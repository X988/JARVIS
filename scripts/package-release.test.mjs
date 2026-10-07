import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildManifest, verifyManifest } from "./package-release.mjs";

describe("release manifest", () => {
  it("binds version, commit, size and sha256 to the artifact", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-release-"));
    const artifact = path.join(root, "jarvis-0.1.0-abc.tar.gz");
    fs.writeFileSync(artifact, "artifact-bytes");
    const commit = "a".repeat(40);
    const manifest = buildManifest({ artifact, version: "0.1.0", commit });
    assert.equal(manifest.version, "0.1.0");
    assert.equal(manifest.commit, commit);
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
    assert.equal(verifyManifest(manifest, artifact), true);

    fs.appendFileSync(artifact, "tampered");
    assert.equal(verifyManifest(manifest, artifact), false);
  });

  it("rejects non-SemVer release identity", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-release-"));
    const artifact = path.join(root, "artifact.tgz");
    fs.writeFileSync(artifact, "x");
    assert.throws(
      () => buildManifest({ artifact, version: "development", commit: "b".repeat(40) }),
      /invalid release version/,
    );
  });
});
