import path from "node:path";

export type JobStatus = "queued" | "running" | "done" | "cancelled" | "denied";

export type Job = {
  id: string;
  status: JobStatus;
  progress: number;
  logs: string[];
  result: string | null;
};

const DENIED = new Set(["push-main", "merge", "deploy", "restart", "production-secret", "self-heal"]);

export function workerAction(action: string): { code: "DENY" | "ALLOW" } {
  return { code: DENIED.has(action) ? "DENY" : "ALLOW" };
}

export function worktreePath(root: string, taskId: string): string | null {
  if (!/^[a-z0-9-]{1,40}$/.test(taskId)) return null;
  return path.join(root, ".jarvis", "worktrees", taskId);
}

export function openJob(id: string): Job {
  return { id, status: "queued", progress: 0, logs: [], result: null };
}
