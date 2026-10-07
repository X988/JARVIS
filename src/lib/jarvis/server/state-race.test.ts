import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { takeToken } from "../rate-limit.ts";
import { actorRequestStorageKey, rememberRequest } from "./idempotency.ts";

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "state-race-worker.ts");

function runWorker(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", worker, ...args], {
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

function runIdempotency(
  dir: string,
  actor: string,
  requestId: string,
  side: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return runWorker(["idempotency", dir, actor, requestId, side], env);
}

function runRate(dir: string, key: string, side: string): Promise<void> {
  return runWorker(["rate-limit", dir, key, side]);
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
      runIdempotency(
        dir,
        "admin",
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

    await runIdempotency(
      dir,
      "admin",
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

  it("scopes duplicate requests by hashed actor and executes a concurrent duplicate once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-race-"));
    const side = path.join(dir, "side.txt");
    await Promise.all([
      runIdempotency(dir, "admin@example.com", "same", side),
      runIdempotency(dir, "admin@example.com", "same", side),
      runIdempotency(dir, "другой-админ", "same", side),
    ]);

    const lines = fs.readFileSync(side, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);

    const stored = JSON.parse(
      fs.readFileSync(path.join(dir, "idempotency.json"), "utf8"),
    ) as Record<string, { state: string }>;
    assert.equal(Object.keys(stored).length, 2);
    assert.equal(Object.values(stored).every((slot) => slot.state === "done"), true);
    assert.equal(Object.keys(stored).some((key) => key.includes("@") || key.includes("другой")), false);
  });

  it("accepts email, Unicode and long actor IDs without exposing them in storage keys", () => {
    const actors = ["admin@example.com", "Администратор-№1", "x".repeat(4_096)];
    const keys = actors.map((actor) => actorRequestStorageKey(actor, "REQ-1"));
    assert.equal(new Set(keys).size, actors.length);
    assert.equal(keys.every((key) => /^[a-f0-9]{64}:REQ-1$/.test(key)), true);
  });

  it("recovers a stale pending idempotency claim after a crash", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-idem-recovery-"));
    const key = actorRequestStorageKey("admin@example.com", "REQ-RECOVER");
    fs.writeFileSync(
      path.join(dir, "idempotency.json"),
      JSON.stringify({ [key]: { state: "pending", at: Date.now() - 31_000 } }),
    );
    let calls = 0;
    const result = rememberRequest(dir, "admin@example.com", "REQ-RECOVER", () => {
      calls += 1;
      return "recovered";
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.value, "recovered");
    assert.equal(calls, 1);
  });

  it("does not steal an old pending claim from a live owner process", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-idem-live-"));
    const key = actorRequestStorageKey("admin@example.com", "REQ-LIVE");
    fs.writeFileSync(
      path.join(dir, "idempotency.json"),
      JSON.stringify({
        [key]: {
          state: "pending",
          at: Date.now() - 60 * 60_000,
          pid: process.pid,
          owner: "00000000-0000-4000-8000-000000000000",
        },
      }),
    );
    const previous = process.env.JARVIS_IDEMPOTENCY_WAIT_MS;
    process.env.JARVIS_IDEMPOTENCY_WAIT_MS = "50";
    let calls = 0;
    try {
      assert.throws(
        () =>
          rememberRequest(dir, "admin@example.com", "REQ-LIVE", () => {
            calls += 1;
            return "unsafe";
          }),
        /idempotency wait timeout/,
      );
      assert.equal(calls, 0);
    } finally {
      if (previous === undefined) delete process.env.JARVIS_IDEMPOTENCY_WAIT_MS;
      else process.env.JARVIS_IDEMPOTENCY_WAIT_MS = previous;
    }
  });

  it("recovers a pending claim immediately when its recorded process is dead", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-idem-dead-"));
    const key = actorRequestStorageKey("admin@example.com", "REQ-DEAD");
    fs.writeFileSync(
      path.join(dir, "idempotency.json"),
      JSON.stringify({
        [key]: {
          state: "pending",
          at: Date.now(),
          pid: 2_000_000_000,
          owner: "00000000-0000-4000-8000-000000000000",
        },
      }),
    );
    let calls = 0;
    const result = rememberRequest(dir, "admin@example.com", "REQ-DEAD", () => {
      calls += 1;
      return "recovered";
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.value, "recovered");
    assert.equal(calls, 1);
  });

  it("prunes timestamped completed requests after configured retention", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-idem-retention-"));
    const oldKey = actorRequestStorageKey("admin@example.com", "REQ-OLD");
    rememberRequest(dir, "admin@example.com", "REQ-OLD", () => "old");

    const file = path.join(dir, "idempotency.json");
    const stored = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      { state: string; at?: number; value?: unknown }
    >;
    assert.equal(stored[oldKey]?.state, "done");
    stored[oldKey]!.at = Date.now() - 120_000;
    fs.writeFileSync(file, JSON.stringify(stored));

    const previous = process.env.JARVIS_IDEMPOTENCY_RETENTION_MS;
    process.env.JARVIS_IDEMPOTENCY_RETENTION_MS = "60000";
    try {
      rememberRequest(dir, "admin@example.com", "REQ-NEW", () => "new");
      const next = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      assert.equal(Object.prototype.hasOwnProperty.call(next, oldKey), false);
    } finally {
      if (previous === undefined) delete process.env.JARVIS_IDEMPOTENCY_RETENTION_MS;
      else process.env.JARVIS_IDEMPOTENCY_RETENTION_MS = previous;
    }
  });

  it("fails closed on corrupted idempotency JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-idem-corrupt-"));
    const target = path.join(dir, "idempotency.json");
    fs.writeFileSync(target, "{broken");
    assert.throws(
      () => rememberRequest(dir, "admin@example.com", "REQ-1", () => "unsafe"),
      /invalid JSON/,
    );
    assert.equal(fs.readFileSync(target, "utf8"), "{broken");
  });

  it("serializes concurrent rate-limit updates across processes without lost updates", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-rate-race-"));
    const side = path.join(dir, "side.txt");
    await Promise.all(Array.from({ length: 24 }, () => runRate(dir, "shared", side)));

    const stored = JSON.parse(
      fs.readFileSync(path.join(dir, "rate.json"), "utf8"),
    ) as Record<string, number[]>;
    assert.equal(stored.shared.length, 24);
    assert.equal(fs.readFileSync(side, "utf8").trim().split("\n").length, 24);
  });

  it("fails closed on corrupted rate-limit state instead of resetting it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-rate-corrupt-"));
    const target = path.join(dir, "rate.json");
    const previous = process.env.JARVIS_STATE_DIR;
    process.env.JARVIS_STATE_DIR = dir;
    fs.writeFileSync(target, "{broken");
    try {
      assert.throws(() => takeToken("login", 2, 1_000, 1_000), /invalid JSON/);
      assert.equal(fs.readFileSync(target, "utf8"), "{broken");
    } finally {
      if (previous === undefined) delete process.env.JARVIS_STATE_DIR;
      else process.env.JARVIS_STATE_DIR = previous;
    }
  });
});
