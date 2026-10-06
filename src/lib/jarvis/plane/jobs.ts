import fs from "node:fs";
import path from "node:path";
import { openJob, type Job } from "./workers.ts";

function file(dir: string): string {
  return path.join(dir, "jobs.json");
}

export function loadJobs(dir: string): Job[] {
  const target = file(dir);
  if (!fs.existsSync(target)) return [];
  return JSON.parse(fs.readFileSync(target, "utf8")) as Job[];
}

export function saveJobs(dir: string, jobs: Job[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(jobs, null, 2));
}

export function enqueue(dir: string, id: string): Job {
  const jobs = loadJobs(dir);
  const job = openJob(id);
  jobs.push(job);
  saveJobs(dir, jobs);
  return job;
}

export function cancelJob(dir: string, id: string): Job | null {
  const jobs = loadJobs(dir);
  const job = jobs.find((item) => item.id === id);
  if (!job || job.status === "done") return job ?? null;
  job.status = "cancelled";
  job.logs.push("отменено оператором");
  saveJobs(dir, jobs);
  return job;
}

export const CODING_STEPS = ["worktree", "branch", "analyze", "modify", "test", "lint", "typecheck", "diff", "report", "pr"] as const;

export function codingTarget(branch: string): { code: "DENY" | "ALLOW"; steps: readonly string[] } {
  if (branch === "main" || branch === "master") return { code: "DENY", steps: [] };
  return { code: "ALLOW", steps: CODING_STEPS };
}

export type PrWatch = "pending" | "failed" | "passed" | "merged";

export function prMayLandOnMain(): false {
  return false;
}
