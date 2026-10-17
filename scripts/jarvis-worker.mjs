#!/usr/bin/env node
/**
 * Background worker for JARVIS.
 * Runs scheduled tasks outside the web process.
 * Single instance via lock file. System actor: risk 0 only.
 */
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const INTERVAL = Math.max(5000, Math.min(3600000, Number(process.env.JARVIS_WORKER_INTERVAL_MS) || 60000));
const STATE_DIR = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data");
const LOCK = path.join(STATE_DIR, "worker.lock");
const HEARTBEAT = path.join(STATE_DIR, "worker.heartbeat");

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function acquireLock() {
  ensureDir();
  try {
    const fd = fs.openSync(LOCK, "wx");
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
}

function writeHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT, JSON.stringify({ at: Date.now(), pid: process.pid }));
  } catch (err) {
    console.error("[worker] heartbeat failed:", err.message);
  }
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`[worker] ${name}: ok`);
  } catch (err) {
    console.error(`[worker] ${name} failed:`, err.message);
  }
}

async function cycle() {
  console.log("[worker] cycle start");
  // Placeholders — real imports require TS runtime or compiled output.
  // System actor must stay risk 0 and must not approve.
  await step("runDue", async () => { /* TODO: import and call runDue */ });
  await step("flushAuditOutbox", async () => { /* TODO: flushAuditOutbox */ });
  await step("cleanupCodingWorktrees", async () => { /* TODO: cleanup */ });
  await step("monitoring", async () => { /* TODO: collect/probe */ });
  writeHeartbeat();
  console.log("[worker] cycle done");
}

async function main() {
  if (!acquireLock()) {
    console.error("[worker] another instance holds the lock. Exiting.");
    process.exit(1);
  }
  console.log(`[worker] starting, interval=${INTERVAL}ms, state=${STATE_DIR}`);
  let running = true;
  const stop = () => { running = false; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  try {
    while (running) {
      await cycle();
      if (!running) break;
      await sleep(INTERVAL);
    }
  } finally {
    releaseLock();
    console.log("[worker] stopped");
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  releaseLock();
  process.exit(1);
});
