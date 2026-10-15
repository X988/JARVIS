/**
 * Verified Autonomy Pipeline — 5-stage gate inspired by OCCP.
 * Every action must pass all stages before reaching the Execution Gateway.
 */
import type { Runbook } from "./runbooks.ts";
import { evaluateRuntimePolicy, type PolicyRuntime, type PolicyGate } from "./policy.ts";
import { maintenanceWindowOpen } from "./policy.ts";

export type PipelineStage =
  | "identity"
  | "inventory"
  | "policy"
  | "approval"
  | "verification";

export type StageResult =
  | { stage: PipelineStage; ok: true }
  | { stage: PipelineStage; ok: false; reason: string };

export type AutonomyContext = {
  actorId: string;
  role: string;
  runbook: Runbook;
  targetId: string;
  targetAllowed: boolean;
  mode: "dry-run" | "mock" | "real";
  elevated?: boolean;
  maintenanceWindow?: boolean;
  hasApproval: boolean;
  killSwitchActive: boolean;
};

export function runAutonomyPipeline(ctx: AutonomyContext): StageResult[] {
  const results: StageResult[] = [];

  // 1. Identity
  if (!ctx.actorId || ctx.actorId === "anonymous") {
    results.push({ stage: "identity", ok: false, reason: "No authenticated actor" });
  } else {
    results.push({ stage: "identity", ok: true });
  }

  // 2. Inventory
  if (!ctx.targetAllowed || !ctx.runbook.targets.includes(ctx.targetId) && ctx.runbook.targets.length > 0) {
    results.push({ stage: "inventory", ok: false, reason: "Target not in inventory or runbook not allowed" });
  } else {
    results.push({ stage: "inventory", ok: true });
  }

  // 3. Policy (includes kill switch and rings)
  if (ctx.killSwitchActive) {
    results.push({ stage: "policy", ok: false, reason: "Kill switch active — all execution halted" });
  } else {
    const runtime: PolicyRuntime = {
      mode: ctx.mode,
      elevated: ctx.elevated,
      maintenanceWindow: ctx.maintenanceWindow ?? maintenanceWindowOpen(new Date()),
    };
    const gate: PolicyGate = evaluateRuntimePolicy(ctx.runbook.policy, runtime);
    if (gate.code === "DENY") {
      results.push({ stage: "policy", ok: false, reason: gate.reason });
    } else if (gate.code === "APPROVAL_REQUIRED" && !ctx.hasApproval) {
      results.push({ stage: "policy", ok: false, reason: "Approval required" });
    } else {
      results.push({ stage: "policy", ok: true });
    }
  }

  // 4. Approval
  if (ctx.runbook.approval !== "none" && !ctx.hasApproval) {
    results.push({ stage: "approval", ok: false, reason: `Approval level ${ctx.runbook.approval} required` });
  } else {
    results.push({ stage: "approval", ok: true });
  }

  // 5. Verification readiness
  if (!ctx.runbook.verification) {
    results.push({ stage: "verification", ok: false, reason: "Runbook has no verification step" });
  } else {
    results.push({ stage: "verification", ok: true });
  }

  return results;
}

export function pipelineAllows(results: StageResult[]): boolean {
  return results.every((r) => r.ok);
}
