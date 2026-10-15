import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";
import type { JarvisRole } from "../server/session.ts";
import {
  cancelJob,
  enqueue,
  loadJobs,
  updateJobState,
} from "./jobs.ts";
import {
  createRecurringTask,
  isTaskDue,
  loadTasks,
  saveTasks,
  type ScheduledTask,
} from "./scheduler.ts";
import type { Job, JobKind } from "./workers.ts";
import { sanitizeLlmText } from "./llm-safety.ts";

export type TaskMeta = {
  id: string;
  ownerId: string;
  attempt: number;
  maxAttempts: number;
  heartbeatAt: string | null;
  leaseUntil: string | null;
  backoffUntil: string | null;
  idempotent: boolean;
  dangerous: boolean;
  history: { at: string; phase: string; code: string }[];
  tools: string[];
  model: string | null;
  memory: string[];
  conclusion: string | null;
};

export type TaskView = {
  id: string;
  kind: JobKind;
  status: Job["status"];
  phase: string;
  progress: number;
  ownerId: string;
  logs: string[];
  result: string | null;
  error: string | null;
  attempt: number;
  maxAttempts: number;
  tools: string[];
  model: string | null;
  memory: string[];
  conclusion: string | null;
  updatedAt: string;
  leaseUntil: string | null;
};

const LEASE_MS = 15_000;

function metaFile(dir: string): string {
  return path.join(dir, "task-meta.json");
}

function loadMeta(dir: string): Record<string, TaskMeta> {
  const target = metaFile(dir);
  if (!fs.existsSync(target)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, TaskMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMeta(dir: string, meta: Record<string, TaskMeta>): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = metaFile(dir);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(meta));
  fs.renameSync(temp, target);
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

function blankMeta(id: string, ownerId: string, idempotent: boolean, dangerous: boolean, now: Date): TaskMeta {
  return {
    id,
    ownerId,
    attempt: 0,
    maxAttempts: 3,
    heartbeatAt: null,
    leaseUntil: null,
    backoffUntil: null,
    idempotent,
    dangerous,
    history: [{ at: now.toISOString(), phase: "queued", code: "QUEUED" }],
    tools: [],
    model: null,
    memory: [],
    conclusion: null,
  };
}

export function enqueueTask(
  dir: string,
  input: { id: string; ownerId: string; kind?: JobKind; idempotent?: boolean; dangerous?: boolean; now?: Date },
): Job {
  const now = input.now ?? new Date();
  const idempotent = input.idempotent !== false && input.dangerous !== true;
  return withStateLock(dir, () => {
    const job = enqueue(dir, input.id, input.kind ?? "general", now);
    const meta = loadMeta(dir);
    if (!meta[job.id]) meta[job.id] = blankMeta(job.id, input.ownerId, idempotent, input.dangerous === true, now);
    saveMeta(dir, meta);
    return job;
  });
}

function recoverUnlocked(dir: string, now: Date): void {
  const jobs = loadJobs(dir);
  const meta = loadMeta(dir);
  for (const job of jobs) {
    if (job.status !== "running") continue;
    const row = meta[job.id];
    const lease = row?.leaseUntil ? Date.parse(row.leaseUntil) : 0;
    if (lease > now.getTime()) continue;
    if (!row || row.dangerous || !row.idempotent) {
      updateJobState(
        dir,
        job.id,
        {
          status: "failed",
          phase: "not-replayed",
          error: "lease expired; non-idempotent step was not replayed",
          log: "recovery skipped dangerous replay",
        },
        now,
      );
      if (row) row.history.push({ at: now.toISOString(), phase: "not-replayed", code: "NOT_REPLAYED" });
      continue;
    }
    if (row.attempt + 1 >= row.maxAttempts) {
      updateJobState(dir, job.id, { status: "failed", phase: "exhausted", error: "attempts exhausted", log: "retry limit" }, now);
      row.history.push({ at: now.toISOString(), phase: "exhausted", code: "EXHAUSTED" });
      continue;
    }
    row.attempt += 1;
    row.backoffUntil = new Date(now.getTime() + backoffMs(row.attempt)).toISOString();
    row.leaseUntil = null;
    updateJobState(dir, job.id, { status: "queued", phase: "retry", log: "requeued idempotent read-only job" }, now);
    row.history.push({ at: now.toISOString(), phase: "retry", code: "REQUEUED" });
  }
  saveMeta(dir, meta);
}

export function recoverTasks(dir: string, now = new Date()): void {
  withStateLock(dir, () => recoverUnlocked(dir, now));
}

export function claimTask(dir: string, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    recoverUnlocked(dir, now);
    const jobs = loadJobs(dir);
    const meta = loadMeta(dir);
    const candidate = jobs.find((job) => {
      if (job.status !== "queued") return false;
      const row = meta[job.id];
      if (!row?.backoffUntil) return true;
      return Date.parse(row.backoffUntil) <= now.getTime();
    });
    if (!candidate) return null;
    const claimed = updateJobState(dir, candidate.id, { status: "running", phase: "starting", log: "worker claimed job" }, now);
    const row = meta[candidate.id] ?? blankMeta(candidate.id, "unknown", true, false, now);
    row.heartbeatAt = now.toISOString();
    row.leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
    row.history.push({ at: now.toISOString(), phase: "starting", code: "CLAIMED" });
    meta[candidate.id] = row;
    saveMeta(dir, meta);
    return claimed;
  });
}

export function heartbeatTask(dir: string, id: string, now = new Date()): TaskMeta | null {
  return withStateLock(dir, () => {
    const jobs = loadJobs(dir);
    const job = jobs.find((item) => item.id === id);
    if (!job || job.status !== "running") return null;
    const meta = loadMeta(dir);
    const row = meta[id];
    if (!row) return null;
    row.heartbeatAt = now.toISOString();
    row.leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
    saveMeta(dir, meta);
    updateJobState(dir, id, { phase: job.phase, log: "heartbeat" }, now);
    return row;
  });
}

export function completeTask(dir: string, id: string, result: string, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    const job = updateJobState(dir, id, { status: "done", phase: "done", progress: 100, result, log: "completed" }, now);
    const meta = loadMeta(dir);
    if (meta[id]) {
      meta[id].conclusion = result.slice(0, 2000);
      meta[id].leaseUntil = null;
      meta[id].history.push({ at: now.toISOString(), phase: "done", code: "DONE" });
      saveMeta(dir, meta);
    }
    return job;
  });
}

export function failTask(dir: string, id: string, error: string, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    const meta = loadMeta(dir);
    const row = meta[id];
    if (row && row.idempotent && !row.dangerous && row.attempt + 1 < row.maxAttempts) {
      row.attempt += 1;
      row.backoffUntil = new Date(now.getTime() + backoffMs(row.attempt)).toISOString();
      row.leaseUntil = null;
      row.history.push({ at: now.toISOString(), phase: "retry", code: "RETRY" });
      saveMeta(dir, meta);
      return updateJobState(dir, id, { status: "queued", phase: "retry", error, log: "retry scheduled" }, now);
    }
    if (row) {
      row.history.push({ at: now.toISOString(), phase: "failed", code: row.dangerous || row.idempotent === false ? "NOT_REPLAYED" : "FAILED" });
      saveMeta(dir, meta);
    }
    return updateJobState(dir, id, { status: "failed", phase: "failed", error, log: "failed without automatic replay" }, now);
  });
}

export function cancelTaskJob(dir: string, id: string, actorId: string, role: JarvisRole, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    const meta = loadMeta(dir);
    const row = meta[id];
    if (row && row.ownerId !== actorId && role !== "admin") return null;
    const job = cancelJob(dir, id, now);
    if (row && job) {
      row.history.push({ at: now.toISOString(), phase: "cancelled", code: "CANCELLED" });
      saveMeta(dir, meta);
    }
    return job;
  });
}

function visible(row: TaskMeta | undefined, actorId: string, role: JarvisRole): boolean {
  if (role === "admin") return true;
  return row?.ownerId === actorId;
}

export function listTasks(dir: string, actorId: string, role: JarvisRole): TaskView[] {
  const jobs = loadJobs(dir);
  const meta = loadMeta(dir);
  return jobs
    .filter((job) => visible(meta[job.id], actorId, role))
    .map((job) => {
      const row = meta[job.id];
      const logs = job.logs.map((line) => sanitizeLlmText(line).text);
      return {
        id: job.id,
        kind: job.kind,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        ownerId: row?.ownerId ?? "",
        logs,
        result: job.result ? sanitizeLlmText(job.result).text : null,
        error: job.error,
        attempt: row?.attempt ?? 0,
        maxAttempts: row?.maxAttempts ?? 0,
        tools: row?.tools ?? [],
        model: row?.model ?? null,
        memory: row?.memory ?? [],
        conclusion: row?.conclusion ? sanitizeLlmText(row.conclusion).text : null,
        updatedAt: job.updatedAt,
        leaseUntil: row?.leaseUntil ?? null,
      };
    });
}

export function recordTaskEvidence(
  dir: string,
  id: string,
  patch: { tool?: string; model?: string; memory?: string; conclusion?: string },
): void {
  withStateLock(dir, () => {
    const meta = loadMeta(dir);
    const row = meta[id];
    if (!row) return;
    if (patch.tool && !row.tools.includes(patch.tool)) row.tools.push(patch.tool);
    if (patch.model) row.model = patch.model;
    if (patch.memory) row.memory.push(patch.memory);
    if (patch.conclusion) row.conclusion = sanitizeLlmText(patch.conclusion).text.slice(0, 2000);
    saveMeta(dir, meta);
  });
}

export function safeTaskReport(view: TaskView): string {
  return [
    `Задание ${view.id}`,
    `Статус: ${view.status}`,
    `Этап: ${view.phase}`,
    `Модель: ${view.model ?? "не выбиралась"}`,
    `Инструменты: ${view.tools.join(", ") || "нет"}`,
    `Память: ${view.memory.join("; ") || "нет"}`,
    `Заключение: ${view.conclusion ?? view.result ?? "нет"}`,
    `Ошибка: ${view.error ?? "нет"}`,
    "Секреты в отчёт не включаются.",
  ].join("\n");
}

function sameMinute(task: ScheduledTask, now: Date): boolean {
  const bucket = now.toISOString().slice(0, 16);
  return task.history.some((row) => row.at.slice(0, 16) === bucket);
}

export function createDiagnosticSchedule(
  dir: string,
  input: { id: string; text: string; cron: string; timezone: string; ownerId: string },
): ScheduledTask | null {
  const task = createRecurringTask(input);
  if (!task) return null;
  return withStateLock(dir, () => {
    const tasks = loadTasks(dir);
    if (tasks.some((item) => item.id === task.id)) return null;
    const stored: ScheduledTask = { ...task, status: "paused", armed: false, ownerId: input.ownerId };
    tasks.push(stored);
    saveTasks(dir, tasks);
    return stored;
  });
}

export function armDiagnosticSchedule(dir: string, id: string, actorId: string, role: JarvisRole): ScheduledTask | null {
  return withStateLock(dir, () => {
    const tasks = loadTasks(dir);
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === "cancelled" || task.status === "completed") return null;
    if (task.ownerId && task.ownerId !== actorId && role !== "admin") return null;
    task.status = "active";
    task.armed = true;
    saveTasks(dir, tasks);
    return { ...task, history: [...task.history] };
  });
}

export function dispatchArmedSchedules(
  dir: string,
  now: Date,
  run: (text: string) => { code: string },
  authorize: (task: ScheduledTask) => boolean,
): { id: string; code: string }[] {
  return withStateLock(dir, () => {
    const tasks = loadTasks(dir);
    const fired: { id: string; code: string }[] = [];
    for (const task of tasks) {
      if (task.armed !== true || !isTaskDue(task, now) || sameMinute(task, now)) continue;
      const allowed = authorize(task);
      const result = allowed ? run(task.text) : { code: "ACTOR_DENIED" };
      task.history.push({ at: now.toISOString(), code: result.code });
      if (task.runAt && allowed) task.status = "completed";
      fired.push({ id: task.id, code: result.code });
    }
    saveTasks(dir, tasks);
    return fired;
  });
}
