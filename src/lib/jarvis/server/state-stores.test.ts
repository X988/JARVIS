import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  FileExecutionStore,
  FileIdempotencyStore,
  FileJobStore,
  FileRateLimitStore,
  createFileStateStores,
} from "./state-stores.ts";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stores-"));
}

describe("filesystem state stores", () => {
  it("wraps idempotency and rate limiting without changing fail-closed semantics", () => {
    const dir = tempDir();
    const idempotency = new FileIdempotencyStore(dir);
    let calls = 0;
    const first = idempotency.remember("admin@example.com", "REQ-1", () => {
      calls += 1;
      return "ok";
    });
    const second = idempotency.remember("admin@example.com", "REQ-1", () => {
      calls += 1;
      return "unsafe";
    });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.value, "ok");
    assert.equal(calls, 1);

    const rate = new FileRateLimitStore(dir);
    assert.equal(rate.take("actor", 1, 1_000, 1_000), true);
    assert.equal(rate.take("actor", 1, 1_000, 1_100), false);
  });

  it("persists durable worker jobs through the JobStore abstraction", () => {
    const dir = tempDir();
    const jobs = new FileJobStore(dir);
    jobs.enqueue("job-1", "coding", new Date("2026-10-07T00:00:00Z"));
    const claimed = jobs.claim(1, new Date("2026-10-07T00:00:01Z"));
    assert.equal(claimed?.id, "job-1");
    assert.equal(claimed?.status, "running");
    const cancelled = jobs.cancel("job-1", new Date("2026-10-07T00:00:02Z"));
    assert.equal(cancelled?.status, "cancelled");
    assert.equal(jobs.list()[0]?.status, "cancelled");
  });

  it("stores execution metadata without persisting the raw actor identifier", () => {
    const dir = tempDir();
    const store = new FileExecutionStore(dir);
    const row = store.append({
      requestId: "REQ-EXEC-1",
      actorId: "admin@example.com",
      runbook: "server.health",
      target: "dc01",
      state: "verified",
      code: "OK",
      at: "2026-10-07T00:00:00Z",
    });
    assert.match(row.actorHash, /^[a-f0-9]{64}$/);
    assert.equal(store.list(1)[0]?.id, row.id);
    assert.doesNotMatch(
      fs.readFileSync(path.join(dir, "executions.json"), "utf8"),
      /admin@example\.com/,
    );
  });

  it("fails closed on corrupted execution state", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "executions.json"), "{broken");
    const store = new FileExecutionStore(dir);
    assert.throws(
      () =>
        store.append({
          requestId: "REQ-EXEC-2",
          actorId: "admin",
          runbook: "server.health",
          target: "dc01",
          state: "failed",
          code: "CONNECT_FAILED",
        }),
      /invalid JSON/,
    );
    assert.equal(fs.readFileSync(path.join(dir, "executions.json"), "utf8"), "{broken");
  });

  it("constructs the complete single-node state bundle without enabling Redis/Postgres", () => {
    const dir = tempDir();
    const stores = createFileStateStores(dir, {});
    assert.equal(stores.locks.id, "file");
    assert.equal(stores.audit.pending(), 0);
    assert.equal(stores.jobs.list().length, 0);
  });
});
