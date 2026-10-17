#!/usr/bin/env node
/**
 * Background worker for JARVIS.
 * Runs scheduled tasks outside the web process (Vercel-friendly).
 * Single instance via state lock.
 */
import { setTimeout as sleep } from "node:timers/promises";

const INTERVAL = Math.max(5000, Math.min(3600000, Number(process.env.JARVIS_WORKER_INTERVAL_MS) || 60000));
const STATE_DIR = process.env.JARVIS_STATE_DIR || ".jarvis-state";

async function withLock(fn) {
  // Placeholder: use existing state-lock mechanism
  console.log("[worker] acquiring lock...");
  try {
    await fn();
  } finally {
    console.log("[worker] released lock");
  }
}

async function cycle() {
  console.log("[worker] cycle start");
  // TODO: call runDue, flushAuditOutbox, cleanupCodingWorktrees, monitoring.collect
  // System actor: risk 0 only, no approvals
  console.log("[worker] cycle done");
}

async function main() {
  console.log(`[worker] starting, interval=${INTERVAL}ms`);
  let running = true;
  const stop = () => { running = false; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  while (running) {
    try {
      await withLock(cycle);
    } catch (err) {
      console.error("[worker] cycle error:", err.message);
    }
    await sleep(INTERVAL);
  }
  console.log("[worker] stopped");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
