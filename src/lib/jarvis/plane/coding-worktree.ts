import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { codingWorkspace } from "./workers.ts";

export type GitRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
};

export type GitRunner = (command: string, args: string[], cwd: string) => GitRun;

function localRunner(command: string, args: string[], cwd: string): GitRun {
  const run = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    error: run.error as NodeJS.ErrnoException | undefined,
  };
}

function safeBaseRef(value: string): boolean {
  return /^(?:HEAD|origin\/[A-Za-z0-9._/-]+|[A-Fa-f0-9]{7,40})$/.test(value) && !value.includes("..");
}

export function prepareCodingWorktree(
  repoRoot: string,
  taskId: string,
  baseRef = "HEAD",
  runner: GitRunner = localRunner,
): { ok: true; worktree: string; branch: string } | { ok: false; code: string; detail: string } {
  const root = path.resolve(repoRoot);
  const workspace = codingWorkspace(root, taskId);
  if (!workspace || !safeBaseRef(baseRef)) {
    return { ok: false, code: "INVALID_WORKSPACE", detail: "task id/base ref отклонены" };
  }
  if (workspace.branch === "main" || workspace.branch === "master") {
    return { ok: false, code: "POLICY_DENIED", detail: "main/master запрещены" };
  }

  const probe = runner("git", ["rev-parse", "--show-toplevel"], root);
  if (probe.status !== 0 || path.resolve(probe.stdout.trim()) !== root) {
    return { ok: false, code: "NOT_A_REPOSITORY", detail: "root не подтверждён как git repository" };
  }

  if (fs.existsSync(workspace.worktree)) {
    return { ok: false, code: "WORKTREE_EXISTS", detail: "worktree уже существует" };
  }
  fs.mkdirSync(path.dirname(workspace.worktree), { recursive: true });

  const added = runner(
    "git",
    ["worktree", "add", "-b", workspace.branch, workspace.worktree, baseRef],
    root,
  );
  if (added.status !== 0) {
    return { ok: false, code: "GIT_FAILED", detail: "git worktree add не выполнен" };
  }
  return { ok: true, worktree: workspace.worktree, branch: workspace.branch };
}

export function codingChecks(
  worktree: string,
  runner: GitRunner = localRunner,
): { ok: boolean; results: Array<{ step: "test" | "lint" | "typecheck"; status: number | null }> } {
  const root = path.resolve(worktree);
  const commands: Array<{ step: "test" | "lint" | "typecheck"; args: string[] }> = [
    { step: "test", args: ["test"] },
    { step: "lint", args: ["run", "lint"] },
    { step: "typecheck", args: ["run", "typecheck"] },
  ];
  const results = commands.map(({ step, args }) => {
    const run = runner("npm", args, root);
    return { step, status: run.status };
  });
  return { ok: results.every((item) => item.status === 0), results };
}

export function codingDiff(
  worktree: string,
  runner: GitRunner = localRunner,
): { ok: true; diff: string } | { ok: false; code: "GIT_FAILED" } {
  const run = runner("git", ["diff", "--no-ext-diff", "--"], path.resolve(worktree));
  if (run.status !== 0) return { ok: false, code: "GIT_FAILED" };
  return { ok: true, diff: run.stdout.slice(0, 2_000_000) };
}

function worktreeRetentionMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.JARVIS_WORKTREE_RETENTION_MS ?? 7 * 24 * 60 * 60 * 1000);
  return Number.isFinite(raw)
    ? Math.max(60 * 60 * 1000, Math.min(90 * 24 * 60 * 60 * 1000, Math.trunc(raw)))
    : 7 * 24 * 60 * 60 * 1000;
}

export function cleanupCodingWorktrees(
  repoRoot: string,
  activeTaskIds: ReadonlySet<string>,
  options: {
    env?: NodeJS.ProcessEnv;
    now?: number;
    runner?: GitRunner;
  } = {},
): {
  removed: number;
  skippedActive: number;
  skippedDirty: number;
  skippedUnsafe: number;
  failed: number;
} {
  const root = path.resolve(repoRoot);
  const runner = options.runner ?? localRunner;
  const now = options.now ?? Date.now();
  const managedRoot = path.join(root, ".jarvis", "worktrees");
  const result = {
    removed: 0,
    skippedActive: 0,
    skippedDirty: 0,
    skippedUnsafe: 0,
    failed: 0,
  };

  const probe = runner("git", ["rev-parse", "--show-toplevel"], root);
  if (probe.status !== 0 || path.resolve(probe.stdout.trim()) !== root) {
    result.failed += 1;
    return result;
  }
  if (!fs.existsSync(managedRoot)) return result;

  const retentionMs = worktreeRetentionMs(options.env ?? process.env);
  for (const entry of fs.readdirSync(managedRoot, { withFileTypes: true })) {
    if (!/^[a-z0-9-]{1,40}$/.test(entry.name)) {
      result.skippedUnsafe += 1;
      continue;
    }
    if (activeTaskIds.has(entry.name)) {
      result.skippedActive += 1;
      continue;
    }

    const full = path.resolve(managedRoot, entry.name);
    if (!full.startsWith(managedRoot + path.sep)) {
      result.skippedUnsafe += 1;
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      result.skippedUnsafe += 1;
      continue;
    }
    if (now - stat.mtimeMs <= retentionMs) continue;

    const status = runner("git", ["status", "--porcelain"], full);
    if (status.status !== 0) {
      result.failed += 1;
      continue;
    }
    if (status.stdout.trim()) {
      result.skippedDirty += 1;
      continue;
    }

    // Deliberately no --force: cleanup must not destroy a dirty/unregistered
    // checkout merely to satisfy retention.
    const removed = runner("git", ["worktree", "remove", full], root);
    if (removed.status === 0) result.removed += 1;
    else result.failed += 1;
  }
  return result;
}

/** Publishing is intentionally outside the worker helper. */
export function workerMayPublish(action: "push" | "merge" | "deploy"): false {
  void action;
  return false;
}
