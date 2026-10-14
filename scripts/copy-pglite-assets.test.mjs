import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { copyPgliteAssets } from "./copy-pglite-assets.mjs";

it("ships the actual WASM and database payload next to the bundled PGlite module", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pglite-build-"));
  try {
    const sourceDir = path.join(root, "source");
    const outputDir = path.join(root, "output");
    const libs = path.join(outputDir, "functions/server/_libs");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(libs, { recursive: true });
    fs.writeFileSync(path.join(libs, "electric-sql__pglite.mjs"), "// bundled JS");
    const names = ["pglite.data", "pglite.wasm", "initdb.wasm"];
    for (const name of names) fs.writeFileSync(path.join(sourceDir, name), Buffer.from([0, 1, 2, name.length]));
    assert.deepEqual(copyPgliteAssets({ sourceDir, outputDir }), [libs]);
    for (const name of names) assert.deepEqual(fs.readFileSync(path.join(libs, name)), fs.readFileSync(path.join(sourceDir, name)));
    fs.rmSync(path.join(sourceDir, "pglite.wasm"));
    assert.throws(() => copyPgliteAssets({ sourceDir, outputDir }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("fails the build instead of silently accepting a changed bundle layout", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pglite-layout-"));
  try { assert.throws(() => copyPgliteAssets({ sourceDir: root, outputDir: root }), /layout needs review/); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
