import fs from "node:fs";
import path from "node:path";
import { actorsFromEnv } from "../plane/telegram.ts";
import { loadTasks } from "../plane/scheduler.ts";
import { loadJobs } from "../plane/jobs.ts";
import { monitoringStatus } from "../monitoring.ts";
import { externalSinkLabel, verifyAudit } from "../audit-log.ts";
import { sshKnownHostsRequired } from "./host-probes.ts";
import { tlsVerificationDisabled } from "./routeros.ts";
import { onecValidationProbe } from "../onec/validation.ts";

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
  let schedulerHealthy = true;
  let workerHealthy = true;
  try {
    const tasks = loadTasks(dir);
    scheduled = tasks.length;
    activeScheduled = tasks.filter((task) => task.status === "active").length;
  } catch {
    schedulerHealthy = false;
  }
  try {
    const queue = loadJobs(dir);
    jobs = queue.length;
    runningJobs = queue.filter((job) => job.status === "running").length;
  } catch {
    workerHealthy = false;
  }

  const actors = actorsFromEnv(env);
  const telegramConfigured = Boolean(env.JARVIS_TELEGRAM_TOKEN?.trim() && env.JARVIS_TELEGRAM_WEBHOOK_SECRET?.trim());
  let auditChain: ComponentStatus;
  try {
    const integrity = verifyAudit(dir);
    auditChain = integrity.ok
      ? { state: "OK", detail: `rows=${integrity.rows}; live delivery not claimed` }
      : { state: "DEGRADED", detail: `broken; rows=${integrity.rows}; reason=${integrity.reason}` };
  } catch {
    auditChain = { state: "DEGRADED", detail: "audit chain unreadable" };
  }
  const monitoring = monitoringStatus(env);
  const auditSink = externalSinkLabel(env);
  const onecValidation = onecValidationProbe(env);
  const onecLevel = onecValidation.testDatabase
    ? "TEST_DATABASE_VERIFIED"
    : onecValidation.designerOrEdt
      ? "DESIGNER_CHECK"
      : onecValidation.bslLanguageServer
        ? "BSL_LANGUAGE_SERVER"
        : "FALLBACK_ONLY";

  return {
    inventory: inventoryStatus(),
    state: {
      state: fs.existsSync(dir) ? "OK" : "CONFIGURED",
      detail: dir,
    },
    audit: {
      state:
        auditSink === "NOT_CONFIGURED" || /INVALID|ADAPTER_DISABLED/.test(auditSink)
          ? "DEGRADED"
          : "CONFIGURED",
      detail: auditSink,
    },
    auditChain,
    sshLab: sshLabStatus(env),
    routerosLab: routerosLabStatus(env),
    scheduler: {
      state: schedulerHealthy ? "OK" : "DEGRADED",
      detail: schedulerHealthy
        ? `tasks=${scheduled}; active=${activeScheduled}`
        : "schedule state invalid",
    },
    worker: {
      state: workerHealthy ? "OK" : "DEGRADED",
      detail: workerHealthy
        ? `jobs=${jobs}; running=${runningJobs}`
        : "worker state invalid",
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
    onecValidation: {
      state: onecLevel === "FALLBACK_ONLY" ? "DEGRADED" : "CONFIGURED",
      detail: [
        `level=${onecLevel}`,
        `bsl=${onecValidation.bslLanguageServer}`,
        `designerOrEdt=${onecValidation.designerOrEdt}`,
        `testDb=${onecValidation.testDatabase}`,
      ].join("; "),
    },
  };
}

function sshLabStatus(env: NodeJS.ProcessEnv): ComponentStatus {
  const required = sshKnownHostsRequired(env);
  const known = Boolean(env.JARVIS_SSH_KNOWN_HOSTS_FILE?.trim());
  const key = Boolean(env.JARVIS_SSH_KEY_FILE?.trim());
  if (required && (!known || !key)) {
    return { state: "DEGRADED", detail: "known_hosts и ключ обязательны; соединение не открывалось" };
  }
  if (!required) return { state: "OK", detail: "live ssh не запрошен; соединение не открывалось" };
  return { state: "CONFIGURED", detail: "known_hosts и ключ заданы; live probe не выполнялся" };
}

function routerosLabStatus(env: NodeJS.ProcessEnv): ComponentStatus {
  if (tlsVerificationDisabled(env)) {
    return { state: "DEGRADED", detail: "проверка TLS отключена; соединение не открывалось" };
  }
  if (!env.JARVIS_MIKROTIK_HOST?.trim()) {
    return { state: "NOT_CONFIGURED", detail: "хост не задан; соединение не открывалось" };
  }
  return {
    state: "CONFIGURED",
    detail: "хост задан; изменяющий REST не подключён; live probe не выполнялся",
  };
}
