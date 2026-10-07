import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "state-race-worker.ts");

function run(dir: string, key: string, side: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", worker, dir, key, side], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}

describe("state lock", () => {
  it("keeps both keys and runs one shared request only once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-race-"));
    const side = path.join(dir, "side.txt");
    await Promise.all([
      run(dir, "same", side),
      run(dir, "same", side),
      run(dir, "other", side),
    ]);
    const lines = fs.readFileSync(side, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "idempotency.json"), "utf8")) as Record<string, { state: string }>;
    assert.equal(stored.same.state, "done");
    assert.equal(stored.other.state, "done");
    assert.equal(fs.existsSync(path.join(dir, "state.lock")), false);
  });
});
