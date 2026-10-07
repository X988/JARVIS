import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";
import { claimNext, openJob, updateJob, type Job, type JobKind } from "./workers.ts";

function jobsFile(dir: string): string {
  return path.join(dir, "jobs.json");
}

export function loadJobs(dir: string): Job[] {
  const target = jobsFile(dir);
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Job[]) : [];
  } catch {
    return [];
  }
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
    const job = updateJob(jobs[index], patch, now);
    jobs[index] = job;
    writeJobs(dir, jobs);
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
