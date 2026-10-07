import fs from "node:fs";
import path from "node:path";
import { actorsFromEnv } from "../plane/telegram.ts";
import { loadTasks } from "../plane/scheduler.ts";
import { loadJobs } from "../plane/jobs.ts";
import { monitoringStatus } from "../monitoring.ts";
import { externalSinkLabel } from "../audit-log.ts";

export type ComponentState = "OK" | "CONFIGURED" | "NOT_CONFIGURED" | "DEGRADED";

export type ComponentStatus = {
  state: ComponentState;
  detail: string;
};

function stateDir(env: NodeJS.ProcessEnv): string {
  return path.resolve(env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"));
}

function inventoryStatus(): ComponentStatus {
  const file = path.join(process.cwd(), "config", "jarvis", "inventory.json");
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { targets?: Array<{ enabled?: boolean }> };
    const targets = Array.isArray(doc.targets) ? doc.targets : [];
    const enabled = targets.filter((target) => target.enabled !== false).length;
    return enabled > 0
      ? { state: "OK", detail: `targets=${targets.length}; enabled=${enabled}` }
      : { state: "DEGRADED", detail: "inventory пуст" };
  } catch {
    return { state: "DEGRADED", detail: "inventory не читается" };
  }
}

export function componentStatus(env: NodeJS.ProcessEnv = process.env): Record<string, ComponentStatus> {
  const dir = stateDir(env);
  let scheduled = 0;
  let activeScheduled = 0;
  let jobs = 0;
  let runningJobs = 0;
  try {
    const tasks = loadTasks(dir);
    scheduled = tasks.length;
    activeScheduled = tasks.filter((task) => task.status === "active").length;
  } catch {
    // Passive readiness reports degraded state below.
  }
  try {
    const queue = loadJobs(dir);
    jobs = queue.length;
    runningJobs = queue.filter((job) => job.status === "running").length;
  } catch {
    // Passive readiness reports degraded state below.
  }

  const actors = actorsFromEnv(env);
  const telegramConfigured = Boolean(env.JARVIS_TELEGRAM_TOKEN?.trim() && env.JARVIS_TELEGRAM_WEBHOOK_SECRET?.trim());
  const monitoring = monitoringStatus(env);
  const auditSink = externalSinkLabel(env);

  return {
    inventory: inventoryStatus(),
    state: {
      state: fs.existsSync(dir) ? "OK" : "CONFIGURED",
      detail: dir,
    },
    audit: {
      state: auditSink === "local-only" ? "DEGRADED" : "CONFIGURED",
      detail: auditSink,
    },
    scheduler: {
      state: "OK",
      detail: `tasks=${scheduled}; active=${activeScheduled}`,
    },
    worker: {
      state: "OK",
      detail: `jobs=${jobs}; running=${runningJobs}`,
    },
    telegram: telegramConfigured
      ? { state: Object.keys(actors).length > 0 ? "CONFIGURED" : "DEGRADED", detail: `actors=${Object.keys(actors).length}` }
      : { state: "NOT_CONFIGURED", detail: "token/webhook secret не заданы" },
    monitoring: monitoring === "MONITORING_NOT_CONFIGURED"
      ? { state: "NOT_CONFIGURED", detail: monitoring }
      : { state: "CONFIGURED", detail: monitoring },
    redis: env.JARVIS_REDIS_URL
      ? { state: "CONFIGURED", detail: "credential reference present; live probe not performed" }
      : { state: "NOT_CONFIGURED", detail: "JARVIS_REDIS_URL не задан" },
    database: env.DATABASE_URL
      ? { state: "CONFIGURED", detail: "DATABASE_URL present; live probe not performed" }
      : { state: "NOT_CONFIGURED", detail: "DATABASE_URL не задан" },
    llm: env.JARVIS_LLM_INTENT || env.JARVIS_LLM_CODING || env.JARVIS_LLM_LOCAL === "1"
      ? { state: "CONFIGURED", detail: "provider routing configured; live probe not performed" }
      : { state: "NOT_CONFIGURED", detail: "LLM provider routing не задан" },
  };
}
