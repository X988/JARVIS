import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { pgliteDataDir } from "./pglite-path.ts";

describe("pglite data dir", () => {
  it("stays in memory unless JARVIS_PGLITE_DIR is set", () => {
    assert.equal(pgliteDataDir({}), undefined);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pglite-"));
    const dir = pgliteDataDir({ JARVIS_PGLITE_DIR: path.join(root, "nested", "db") });
    assert.equal(dir, path.join(root, "nested", "db"));
    assert.equal(fs.existsSync(dir!), true);
  });
});
