import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AuditRow } from "../audit-log.ts";
import {
  enqueueAuditDelivery,
  flushAuditOutbox,
  loadAuditOutbox,
} from "../audit-outbox.ts";
import { createLockProvider, type LockProvider } from "../locks.ts";
import {
  cancelJob,
  claimJob,
  enqueue,
  loadJobs,
  updateJobState,
} from "../plane/jobs.ts";
import type { Job, JobKind } from "../plane/workers.ts";
import { takeTokenInDir } from "../rate-limit.ts";
import {
  createApproval,
  findApproval,
  saveApproval,
  type ApprovalRecord,
} from "./approvals.ts";
import { rememberRequest, validRequestId } from "./idempotency.ts";
import { withStateLock } from "./state-lock.ts";

export interface ApprovalStore {
  create(row: Omit<ApprovalRecord, "status" | "stage">): ApprovalRecord;
  find(id: string): ApprovalRecord | null;
  save(row: ApprovalRecord): void;
}

export class FileApprovalStore implements ApprovalStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  create(row: Omit<ApprovalRecord, "status" | "stage">): ApprovalRecord {
    return createApproval(this.dir, row);
  }

  find(id: string): ApprovalRecord | null {
    return findApproval(this.dir, id);
  }

  save(row: ApprovalRecord): void {
    saveApproval(this.dir, row);
  }
}

export interface IdempotencyStore {
  remember<T>(
    actorId: string,
    requestId: string,
    produce: () => T,
  ): { duplicate: boolean; value: T };
}

export class FileIdempotencyStore implements IdempotencyStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  remember<T>(
    actorId: string,
    requestId: string,
    produce: () => T,
  ): { duplicate: boolean; value: T } {
    return rememberRequest(this.dir, actorId, requestId, produce);
  }
}

export interface RateLimitStore {
  take(key: string, limit: number, windowMs: number, now?: number): boolean;
}

export class FileRateLimitStore implements RateLimitStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  take(key: string, limit: number, windowMs: number, now?: number): boolean {
    return takeTokenInDir(this.dir, key, limit, windowMs, now);
  }
}

export interface JobStore {
  list(): Job[];
  enqueue(id: string, kind?: JobKind, now?: Date): Job;
  claim(maxRunning?: number, now?: Date): Job | null;
  update(
    id: string,
    patch: Parameters<typeof updateJobState>[2],
    now?: Date,
  ): Job | null;
  cancel(id: string, now?: Date): Job | null;
}

export class FileJobStore implements JobStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  list(): Job[] {
    return loadJobs(this.dir);
  }

  enqueue(id: string, kind: JobKind = "general", now = new Date()): Job {
    return enqueue(this.dir, id, kind, now);
  }

  claim(maxRunning = 1, now = new Date()): Job | null {
    return claimJob(this.dir, maxRunning, now);
  }

  update(
    id: string,
    patch: Parameters<typeof updateJobState>[2],
    now = new Date(),
  ): Job | null {
    return updateJobState(this.dir, id, patch, now);
  }

  cancel(id: string, now = new Date()): Job | null {
    return cancelJob(this.dir, id, now);
  }
}

export interface AuditSink {
  enqueue(row: AuditRow): boolean;
  flush(): Promise<{ attempted: number; delivered: number; remaining: number }>;
  pending(): number;
}

export class FileAuditSink implements AuditSink {
  private readonly dir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetcher: typeof fetch;

  constructor(
    dir: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher: typeof fetch = fetch,
  ) {
    this.dir = dir;
    this.env = env;
    this.fetcher = fetcher;
  }

  enqueue(row: AuditRow): boolean {
    return enqueueAuditDelivery(row, this.dir, this.env);
  }

  flush(): Promise<{ attempted: number; delivered: number; remaining: number }> {
    return flushAuditOutbox(this.dir, this.env, this.fetcher);
  }

  pending(): number {
    return loadAuditOutbox(this.dir).length;
  }
}

export type ExecutionState =
  | "planned"
  | "running"
  | "verified"
  | "failed"
  | "denied";

export type ExecutionRecord = {
  id: string;
  at: string;
  requestId: string;
  actorHash: string;
  runbook: string;
  target: string;
  state: ExecutionState;
  code: string;
};

export type ExecutionRecordInput = Omit<
  ExecutionRecord,
  "id" | "actorHash" | "at"
> & {
  actorId: string;
  at?: string;
};

export interface ExecutionStore {
  append(input: ExecutionRecordInput): ExecutionRecord;
  list(limit?: number): ExecutionRecord[];
}

function executionFile(dir: string): string {
  return path.join(dir, "executions.json");
}

function validExecutionRecord(value: unknown): value is ExecutionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<ExecutionRecord>;
  return (
    typeof row.id === "string" &&
    /^[a-f0-9-]{36}$/.test(row.id) &&
    typeof row.at === "string" &&
    Number.isFinite(Date.parse(row.at)) &&
    typeof row.requestId === "string" &&
    validRequestId(row.requestId) &&
    typeof row.actorHash === "string" &&
    /^[a-f0-9]{64}$/.test(row.actorHash) &&
    typeof row.runbook === "string" &&
    /^[a-z][a-z0-9.-]{1,95}$/.test(row.runbook) &&
    typeof row.target === "string" &&
    /^[A-Za-z0-9._:-]{1,96}$/.test(row.target) &&
    typeof row.state === "string" &&
    ["planned", "running", "verified", "failed", "denied"].includes(row.state) &&
    typeof row.code === "string" &&
    /^[A-Z0-9_:-]{1,128}$/.test(row.code)
  );
}

function readExecutions(dir: string): ExecutionRecord[] {
  const target = executionFile(dir);
  if (!fs.existsSync(target)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  } catch {
    throw new Error("execution state is invalid JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every(validExecutionRecord)) {
    throw new Error("execution state contains invalid records");
  }
  return parsed.map((row) => ({ ...row }));
}

function writeExecutions(dir: string, rows: ExecutionRecord[]): void {
  if (!rows.every(validExecutionRecord)) {
    throw new Error("refusing to persist invalid execution state");
  }
  fs.mkdirSync(dir, { recursive: true });
  const target = executionFile(dir);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(rows, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function boundedHistoryMax(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value)
    ? Math.max(100, Math.min(100_000, Math.trunc(value)))
    : 10_000;
}

export class FileExecutionStore implements ExecutionStore {
  private readonly dir: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    dir: string,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.dir = dir;
    this.env = env;
  }

  append(input: ExecutionRecordInput): ExecutionRecord {
    if (!input.actorId || input.actorId.length > 8_192) {
      throw new Error("invalid execution actor");
    }
    const actorHash = createHash("sha256")
      .update(input.actorId, "utf8")
      .digest("hex");
    const row: ExecutionRecord = {
      id: randomUUID(),
      at: input.at ?? new Date().toISOString(),
      requestId: input.requestId,
      actorHash,
      runbook: input.runbook,
      target: input.target,
      state: input.state,
      code: input.code,
    };
    if (!validExecutionRecord(row)) throw new Error("invalid execution record");

    return withStateLock(this.dir, () => {
      const rows = readExecutions(this.dir);
      rows.push(row);
      const max = boundedHistoryMax(this.env.JARVIS_EXECUTION_HISTORY_MAX);
      writeExecutions(this.dir, rows.slice(-max));
      return { ...row };
    });
  }

  list(limit = 100): ExecutionRecord[] {
    const bounded = Math.max(1, Math.min(1_000, Math.trunc(limit)));
    return readExecutions(this.dir).slice(-bounded).map((row) => ({ ...row }));
  }
}

export type StateStores = {
  approvals: ApprovalStore;
  idempotency: IdempotencyStore;
  rateLimits: RateLimitStore;
  locks: LockProvider;
  jobs: JobStore;
  audit: AuditSink;
  executions: ExecutionStore;
};

export function createFileStateStores(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
): StateStores {
  return {
    approvals: new FileApprovalStore(dir),
    idempotency: new FileIdempotencyStore(dir),
    rateLimits: new FileRateLimitStore(dir),
    locks: createLockProvider(path.join(dir, "locks"), env),
    jobs: new FileJobStore(dir),
    audit: new FileAuditSink(dir, env),
    executions: new FileExecutionStore(dir, env),
  };
}
