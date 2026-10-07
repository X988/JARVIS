import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "state-race-worker.ts");

function run(
  dir: string,
  key: string,
  side: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", worker, dir, key, side], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}

describe("state lock", () => {
  it("does not steal an old lock from a live process", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-live-lock-"));
    const side = path.join(dir, "side.txt");
    const lock = path.join(dir, "state.lock");
    fs.writeFileSync(lock, String(process.pid));
    const old = new Date(Date.now() - 5 * 60_000);
    fs.utimesSync(lock, old, old);

    await assert.rejects(
      run(
        dir,
        "blocked",
        side,
        {
          ...process.env,
          JARVIS_STATE_LOCK_TIMEOUT_MS: "150",
          JARVIS_STATE_LOCK_STALE_MS: "1000",
        },
      ),
      /state lock timeout/,
    );
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.existsSync(side), false);
  });

  it("recovers an old malformed lock instead of blocking forever", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stale-lock-"));
    const side = path.join(dir, "side.txt");
    const lock = path.join(dir, "state.lock");
    fs.writeFileSync(lock, "not-a-pid");
    const old = new Date(Date.now() - 5 * 60_000);
    fs.utimesSync(lock, old, old);

    await run(
      dir,
      "recovered",
      side,
      {
        ...process.env,
        JARVIS_STATE_LOCK_TIMEOUT_MS: "500",
        JARVIS_STATE_LOCK_STALE_MS: "1000",
      },
    );
    assert.equal(fs.readFileSync(side, "utf8").trim().length > 0, true);
    assert.equal(fs.existsSync(lock), false);
  });

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
