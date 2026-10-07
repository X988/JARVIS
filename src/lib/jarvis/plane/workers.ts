import path from "node:path";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "denied";
export type JobKind = "general" | "research" | "coding" | "ci-diagnosis" | "security-audit";

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  phase: string;
  logs: string[];
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const DENIED = new Set([
  "push-main",
  "push-master",
  "merge",
  "deploy",
  "restart",
  "production-secret",
  "credential-entry",
  "shell-production",
  "database-drop",
  "self-heal",
]);

export function workerAction(action: string): { code: "DENY" | "ALLOW" } {
  return { code: DENIED.has(action) ? "DENY" : "ALLOW" };
}

export function worktreePath(root: string, taskId: string): string | null {
  if (!/^[a-z0-9-]{1,40}$/.test(taskId)) return null;
  return path.join(path.resolve(root), ".jarvis", "worktrees", taskId);
}

export function workerBranch(taskId: string): string | null {
  if (!/^[a-z0-9-]{1,40}$/.test(taskId)) return null;
  return `jarvis/task-${taskId}`;
}

export function openJob(id: string, kind: JobKind = "general", now = new Date()): Job {
  const at = now.toISOString();
  return {
    id,
    kind,
    status: "queued",
    progress: 0,
    phase: "queued",
    logs: [],
    result: null,
    error: null,
    createdAt: at,
    updatedAt: at,
  };
}

export function updateJob(
  job: Job,
  patch: {
    status?: JobStatus;
    progress?: number;
    phase?: string;
    log?: string;
    result?: string | null;
    error?: string | null;
  },
  now = new Date(),
): Job {
  const progress = patch.progress === undefined
    ? job.progress
    : Math.max(job.progress, Math.min(100, Math.max(0, Math.trunc(patch.progress))));
  const logs = patch.log ? [...job.logs, patch.log].slice(-200) : [...job.logs];
  return {
    ...job,
    status: patch.status ?? job.status,
    progress,
    phase: patch.phase ?? job.phase,
    logs,
    result: patch.result === undefined ? job.result : patch.result,
    error: patch.error === undefined ? job.error : patch.error,
    updatedAt: now.toISOString(),
  };
}

export function claimNext(jobs: Job[], maxRunning: number, now = new Date()): { jobs: Job[]; claimed: Job | null } {
  const limit = Math.max(1, Math.min(16, Math.trunc(maxRunning || 1)));
  const running = jobs.filter((job) => job.status === "running").length;
  if (running >= limit) return { jobs: jobs.map((job) => ({ ...job, logs: [...job.logs] })), claimed: null };
  const index = jobs.findIndex((job) => job.status === "queued");
  if (index < 0) return { jobs: jobs.map((job) => ({ ...job, logs: [...job.logs] })), claimed: null };
  const next = updateJob(jobs[index], { status: "running", phase: "starting", log: "worker claimed job" }, now);
  const copy = jobs.map((job, cursor) => cursor === index ? next : { ...job, logs: [...job.logs] });
  return { jobs: copy, claimed: next };
}

export const CODING_STEPS = [
  "worktree",
  "branch",
  "analyze",
  "modify",
  "test",
  "lint",
  "typecheck",
  "diff",
  "report",
  "pr",
] as const;

export function codingWorkspace(root: string, taskId: string): {
  worktree: string;
  branch: string;
  steps: readonly string[];
  productionCredentials: false;
} | null {
  const worktree = worktreePath(root, taskId);
  const branch = workerBranch(taskId);
  if (!worktree || !branch) return null;
  return { worktree, branch, steps: CODING_STEPS, productionCredentials: false };
}
