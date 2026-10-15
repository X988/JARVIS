export type ExecutionMode = "dry-run" | "live";

export type Risk = "read-only" | "change";

export type Role = "admin" | "operator" | "viewer";

export type Actor = {
  id: string;
  name: string;
  role: Role;
  allowed: boolean;
  telegramId: number;
};

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type CallResult =
  | "dry_run"
  | "executed"
  | "awaiting_approval"
  | "approved_dry_run"
  | "rejected"
  | "denied"
  | "forbidden"
  | "error";

export type PublicCall = {
  id: string;
  tool: string;
  risk: Risk;
  host: string;
  command: string;
  result: CallResult;
  detail: string;
  approvalId: string | null;
};

export type AuditRecord = {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  role: Role;
  tool: string;
  risk: Risk;
  command: string;
  host: string;
  mode: ExecutionMode;
  approvalId: string | null;
  result: CallResult;
  detail: string;
};

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
};

export type Plan = {
  text: string;
  toolCalls: ToolCall[];
};

export type SshHost = {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile: string | null;
  configured: boolean;
};

export type MikrotikConfig = {
  alias: string;
  host: string;
  user: string;
  password: string | null;
  port: number;
  tlsInsecure: boolean;
  configured: boolean;
};

export type ToolConfig = {
  mode: ExecutionMode;
  sshHosts: SshHost[];
  sshAllowRead: string[];
  sshAllowChange: string[];
  sshDeny: string[];
  mikrotik: MikrotikConfig;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  auditPath: string;
  knownHostsPath: string;
  operators: Actor[] | null;
};

export type PlannedSsh = {
  transport: "ssh";
  host: SshHost;
  command: string;
};

export type PlannedMikrotik = {
  transport: "mikrotik";
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: Record<string, unknown>;
};

export type PlannedCommand = {
  tool: string;
  risk: Risk;
  host: string;
  command: string;
  action: PlannedSsh | PlannedMikrotik;
};
