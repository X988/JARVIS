import fs from "node:fs";
import path from "node:path";
import { increment } from "../metrics.ts";
import { withStateLock } from "../server/state-lock.ts";
import { claimNext, openJob, updateJob, type Job, type JobKind } from "./workers.ts";

function jobsFile(dir: string): string {
  return path.join(dir, "jobs.json");
}

const JOB_KINDS = new Set<JobKind>(["general", "research", "coding", "ci-diagnosis", "security-audit"]);
const JOB_STATUSES = new Set<Job["status"]>(["queued", "running", "done", "failed", "cancelled", "denied"]);

function validPersistedJob(value: unknown): value is Job {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as Partial<Job>;
  return (
    typeof job.id === "string" &&
    /^[A-Za-z0-9._:-]{1,96}$/.test(job.id) &&
    typeof job.kind === "string" &&
    JOB_KINDS.has(job.kind as JobKind) &&
    typeof job.status === "string" &&
    JOB_STATUSES.has(job.status as Job["status"]) &&
    typeof job.progress === "number" &&
    Number.isFinite(job.progress) &&
    job.progress >= 0 &&
    job.progress <= 100 &&
    typeof job.phase === "string" &&
    job.phase.length <= 200 &&
    Array.isArray(job.logs) &&
    job.logs.length <= 10_000 &&
    job.logs.every((line) => typeof line === "string" && line.length <= 4_000) &&
    (job.result === null || typeof job.result === "string") &&
    (job.error === null || typeof job.error === "string") &&
    typeof job.createdAt === "string" &&
    Number.isFinite(Date.parse(job.createdAt)) &&
    typeof job.updatedAt === "string" &&
    Number.isFinite(Date.parse(job.updatedAt))
  );
}

export function loadJobs(dir: string): Job[] {
  const target = jobsFile(dir);
  if (!fs.existsSync(target)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch {
    throw new Error("worker state invalid");
  }
  if (!Array.isArray(parsed) || !parsed.every(validPersistedJob)) {
    throw new Error("worker state invalid");
  }
  return parsed.map((job) => ({ ...job, logs: [...job.logs] }));
}

function writeJobs(dir: string, jobs: Job[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = jobsFile(dir);
  const temp = target + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(jobs, null, 2));
  fs.renameSync(temp, target);
}

export function saveJobs(dir: string, jobs: Job[]): void {
  withStateLock(dir, () => writeJobs(dir, jobs));
}

export function enqueue(dir: string, id: string, kind: JobKind = "general", now = new Date()): Job {
  return withStateLock(dir, () => {
    const jobs = loadJobs(dir);
    const existing = jobs.find((item) => item.id === id);
    if (existing) return existing;
    const job = openJob(id, kind, now);
    jobs.push(job);
    writeJobs(dir, jobs);
    increment("jarvis_worker_jobs_total");
    return job;
  });
}

export function claimJob(dir: string, maxRunning = 1, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    const state = claimNext(loadJobs(dir), maxRunning, now);
    if (state.claimed) writeJobs(dir, state.jobs);
    return state.claimed;
  });
}

export function updateJobState(
  dir: string,
  id: string,
  patch: Parameters<typeof updateJob>[1],
  now = new Date(),
): Job | null {
  return withStateLock(dir, () => {
    const jobs = loadJobs(dir);
    const index = jobs.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const before = jobs[index];
    const job = updateJob(before, patch, now);
    jobs[index] = job;
    writeJobs(dir, jobs);
    if (before.status !== "failed" && job.status === "failed") {
      increment("jarvis_worker_failures_total");
    }
    return job;
  });
}

export function cancelJob(dir: string, id: string, now = new Date()): Job | null {
  return withStateLock(dir, () => {
    const jobs = loadJobs(dir);
    const index = jobs.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = jobs[index];
    if (current.status === "done" || current.status === "cancelled") return current;
    const job = updateJob(current, { status: "cancelled", phase: "cancelled", log: "отменено оператором" }, now);
    jobs[index] = job;
    writeJobs(dir, jobs);
    return job;
  });
}

export const CODING_STEPS = ["worktree", "branch", "analyze", "modify", "test", "lint", "typecheck", "diff", "report", "pr"] as const;

export function planForBranch(branch: string): { code: "DENY" | "ALLOW"; steps: readonly string[] } {
  if (branch === "main" || branch === "master") return { code: "DENY", steps: [] };
  return { code: "ALLOW", steps: CODING_STEPS };
}

export type PrWatch = "pending" | "failed" | "passed" | "merged";

export function prMayLandOnMain(): false {
  return false;
}
