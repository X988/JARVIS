import type { Risk } from "../model.ts";

export type PolicyVerdict = "ALLOW" | "APPROVAL_REQUIRED" | "DENY_ALWAYS";
export type ExecutionMode = "mock" | "dry-run" | "real";
export type ApprovalMode = "none" | "single" | "double";
export type Constraint = "NO_CHANGE";
export type ExecutorType = "mock" | "file-onec" | "powershell" | "ssh" | "sql" | "routeros" | "docker";

export type Actor = {
  id: string;
  sessionId: string;
  role: "operator" | "admin" | "readonly";
  channel: "web" | "telegram" | "test";
};

export type InventoryTarget = {
  id: string;
  displayName: string;
  type: "windows" | "linux" | "database" | "mikrotik" | "onec-export" | "repository";
  environment: "development" | "test" | "production";
  roles: string[];
  reference: string;
  aliases: string[];
  enabled: boolean;
  allowedRunbooks: string[];
};

export type RunbookDefinition = {
  id: string;
  title: string;
  mutating: boolean;
  inputKeys: string[];
  executor: ExecutorType;
  risk: Risk;
  targetTypes: InventoryTarget["type"][];
  timeoutMs: number;
  approvalMode: ApprovalMode;
  verification: string;
  lockingStrategy: "none" | "target" | "target-runbook";
  idempotencyStrategy: "request-id";
};

export type ApprovalRecord = {
  id: string;
  actorId: string;
  runbookId: string;
  targetId: string;
  normalizedParameters: Record<string, string>;
  parameterHash: string;
  risk: Risk;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "expired" | "cancelled" | "consumed";
  stage: 1 | 2;
};

export type ExecutionResult = {
  status: "NOT_EXECUTED" | "DRY_RUN" | "MOCK" | "SUCCEEDED" | "FAILED";
  code: "OK" | "DRY_RUN" | "MOCK_ONLY" | "APPROVAL_REQUIRED" | "EXECUTION_DISABLED" | "EXECUTION_TIMEOUT" | "CREDENTIAL_UNAVAILABLE" | "ADAPTER_DISABLED" | "NOT_CONFIGURED" | "VERIFICATION_FAILED" | "LOCKED";
  executor: ExecutorType;
  mode: ExecutionMode;
  durationMs: number;
  detail?: unknown;
};

export type VerificationResult = {
  ok: boolean | null;
  code: "NOT_RUN" | "PASSED" | "FAILED" | "DEGRADED";
  detail: string;
};

export type CommandRequest = {
  text?: unknown;
  dry_run?: unknown;
  request_id?: unknown;
  approval_id?: unknown;
  confirmation?: unknown;
  [key: string]: unknown;
};

export type CommandErrorCode = "AUTH_REQUIRED" | "ACTOR_DENIED" | "SCHEMA_INVALID" | "TARGET_NOT_FOUND" | "RUNBOOK_NOT_FOUND" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_EXPIRED" | "APPROVAL_MISMATCH" | "EXECUTION_DISABLED" | "EXECUTION_TIMEOUT" | "VERIFICATION_FAILED" | "REQUEST_IN_PROGRESS";

export type PipelineStage = {
  stage: "Authentication" | "Normalize" | "Parse" | "Resolve aliases" | "Extract constraints" | "Build steps" | "Inventory" | "Runbook Registry" | "Policy" | "Risk" | "Approval" | "Execution Gateway" | "Executor" | "Verification" | "Audit";
  ok: boolean;
  detail: string;
};

export type CommandResponse = {
  commandId: string;
  requestId: string;
  sessionId: string | null;
  actorId: string | null;
  original: string;
  normalized: string;
  recognizedCommand: string | null;
  intents: string[];
  steps: string[];
  constraints: Constraint[];
  targets: InventoryTarget[];
  runbooks: RunbookDefinition[];
  risk: Risk | null;
  policy: PolicyVerdict;
  approval: ApprovalRecord | null;
  execution: ExecutionResult | null;
  verification: VerificationResult;
  auditId: string | null;
  mode: ExecutionMode;
  code: CommandErrorCode | "OK";
  trace: PipelineStage[];
};
