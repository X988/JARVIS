import { canApprove } from "./actors.ts";
import type { AuditStore } from "./audit-store.ts";
import { assertMikrotikCall, type MikrotikClient } from "./mikrotik-client.ts";
import { prepareToolCall } from "./registry.ts";
import { redactText } from "./redact.ts";
import type { CommandExecutor } from "./ssh-exec.ts";
import type { Actor, AuditRecord, CallResult, PlannedCommand, PublicCall, ToolCall, ToolConfig } from "./types.ts";

type Pending = {
  id: string;
  planned: PlannedCommand;
  requestedBy: string;
};

export type ToolEngineDeps = {
  config: ToolConfig;
  audit: AuditStore;
  ssh: CommandExecutor;
  mikrotik: MikrotikClient;
  now?: () => Date;
  id?: (prefix: string) => string;
};

export class ToolEngine {
  readonly config: ToolConfig;
  readonly audit: AuditStore;
  private readonly ssh: CommandExecutor;
  private readonly mikrotik: MikrotikClient;
  private readonly now: () => Date;
  private readonly id: (prefix: string) => string;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  constructor(deps: ToolEngineDeps) {
    this.config = deps.config;
    this.audit = deps.audit;
    this.ssh = deps.ssh;
    this.mikrotik = deps.mikrotik;
    this.now = deps.now ?? (() => new Date());
    this.id =
      deps.id ??
      ((prefix) => {
        this.seq += 1;
        return `${prefix}-${this.seq}`;
      });
  }

  async call(actor: Actor, toolCall: ToolCall): Promise<PublicCall> {
    if (!actor.allowed) {
      return this.record(actor, {
        tool: toolCall.name || "none",
        risk: "read-only",
        host: "—",
        command: toolCall.name || "none",
        result: "denied",
        detail: "actor is not allowed",
        approvalId: null,
      });
    }
    const prepared = prepareToolCall(toolCall, this.config, this.now());
    if (!prepared.ok) {
      return this.record(actor, {
        tool: toolCall.name,
        risk: prepared.risk,
        host: "—",
        command: prepared.command,
        result: "denied",
        detail: prepared.error,
        approvalId: null,
      });
    }
    const planned = prepared.planned;
    if (planned.risk === "read-only") {
      if (this.config.mode === "dry-run") {
        return this.record(actor, {
          tool: planned.tool,
          risk: planned.risk,
          host: planned.host,
          command: planned.command,
          result: "dry_run",
          detail: "dry-run: command was not sent",
          approvalId: null,
        });
      }
      try {
        const output = await this.execute(planned);
        return this.record(actor, {
          tool: planned.tool,
          risk: planned.risk,
          host: planned.host,
          command: planned.command,
          result: "executed",
          detail: output,
          approvalId: null,
        });
      } catch (error) {
        return this.record(actor, {
          tool: planned.tool,
          risk: planned.risk,
          host: planned.host,
          command: planned.command,
          result: "error",
          detail: error instanceof Error ? error.message : "execution failed",
          approvalId: null,
        });
      }
    }
    const approvalId = this.id("apr");
    this.pending.set(approvalId, { id: approvalId, planned, requestedBy: actor.id });
    return this.record(actor, {
      tool: planned.tool,
      risk: "change",
      host: planned.host,
      command: planned.command,
      result: "awaiting_approval",
      detail: "waiting for Approve or Reject",
      approvalId,
    });
  }

  async decide(actor: Actor, approvalId: string, decision: "approve" | "reject"): Promise<PublicCall> {
    if (!actor.allowed || !canApprove(actor.role)) {
      return this.record(actor, {
        tool: "approval",
        risk: "change",
        host: "—",
        command: approvalId,
        result: "forbidden",
        detail: "only operator or admin can approve",
        approvalId,
      });
    }
    const pending = this.pending.get(approvalId);
    if (!pending) {
      return this.record(actor, {
        tool: "approval",
        risk: "change",
        host: "—",
        command: approvalId,
        result: "error",
        detail: "approval not found",
        approvalId,
      });
    }
    this.pending.delete(approvalId);
    const planned = pending.planned;
    if (decision === "reject") {
      return this.record(actor, {
        tool: planned.tool,
        risk: "change",
        host: planned.host,
        command: planned.command,
        result: "rejected",
        detail: `rejected. requested by ${pending.requestedBy}`,
        approvalId,
      });
    }
    if (this.config.mode === "dry-run") {
      return this.record(actor, {
        tool: planned.tool,
        risk: "change",
        host: planned.host,
        command: planned.command,
        result: "approved_dry_run",
        detail: `approved in dry-run; command was not sent. requested by ${pending.requestedBy}`,
        approvalId,
      });
    }
    try {
      const output = await this.execute(planned);
      return this.record(actor, {
        tool: planned.tool,
        risk: "change",
        host: planned.host,
        command: planned.command,
        result: "executed",
        detail: output,
        approvalId,
      });
    } catch (error) {
      return this.record(actor, {
        tool: planned.tool,
        risk: "change",
        host: planned.host,
        command: planned.command,
        result: "error",
        detail: error instanceof Error ? error.message : "execution failed",
        approvalId,
      });
    }
  }

  private async execute(planned: PlannedCommand): Promise<string> {
    if (planned.action.transport === "ssh") {
      if (!planned.action.host.configured || !planned.action.host.identityFile) {
        throw new Error("SSH identity file is not configured");
      }
      const result = await this.ssh({
        host: planned.action.host,
        command: planned.action.command,
        knownHostsPath: this.config.knownHostsPath,
      });
      return result.output;
    }
    assertMikrotikCall(planned.action);
    if (!this.config.mikrotik.configured) {
      throw new Error("MikroTik credentials are not configured");
    }
    const result = await this.mikrotik.request({
      method: planned.action.method,
      path: planned.action.path,
      body: planned.action.body,
    });
    return `HTTP ${result.status}\n${result.body}`;
  }

  private async record(
    actor: Actor,
    fields: {
      tool: string;
      risk: PlannedCommand["risk"];
      host: string;
      command: string;
      result: CallResult;
      detail: string;
      approvalId: string | null;
    },
  ): Promise<PublicCall> {
    const call: PublicCall = {
      id: this.id("call"),
      tool: fields.tool,
      risk: fields.risk,
      host: fields.host,
      command: redactText(fields.command).slice(0, 500),
      result: fields.result,
      detail: redactText(fields.detail).slice(0, 4000),
      approvalId: fields.approvalId,
    };
    const audit: AuditRecord = {
      id: this.id("aud"),
      at: this.now().toISOString(),
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      tool: call.tool,
      risk: call.risk,
      command: call.command,
      host: call.host,
      mode: this.config.mode,
      approvalId: call.approvalId,
      result: call.result,
      detail: call.detail,
    };
    await this.audit.append(audit);
    return call;
  }
}
