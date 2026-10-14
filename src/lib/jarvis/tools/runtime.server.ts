import { readFile } from "node:fs/promises";
import { DEMO_ACTORS, resolveActor } from "./actors.ts";
import { publicConfig, loadToolConfig } from "./config.ts";
import { createFileAuditStore } from "./audit-store.ts";
import { ToolEngine } from "./engine.ts";
import { createPlanner, runToolLoop, type Planner } from "./loop.ts";
import { createMikrotikClient } from "./mikrotik-client.ts";
import { createSshExecutor } from "./ssh-exec.ts";
import type { PublicCall } from "./types.ts";

let engine: ToolEngine | null = null;
let planner: Planner | null = null;

async function readSecrets(): Promise<string | null> {
  const path = process.env.JARVIS_SECRETS_FILE?.trim();
  if (!path) return null;
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function getRuntime(): Promise<{ engine: ToolEngine; planner: Planner }> {
  if (engine && planner) return { engine, planner };
  const config = loadToolConfig(process.env, await readSecrets());
  engine = new ToolEngine({
    config,
    audit: createFileAuditStore(config.auditPath),
    ssh: createSshExecutor(),
    mikrotik: createMikrotikClient(config.mikrotik),
  });
  planner = createPlanner(config);
  return { engine, planner };
}

export async function handleStatus() {
  const { engine: current } = await getRuntime();
  const actors = (current.config.operators ?? DEMO_ACTORS).map((actor) => ({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    allowed: actor.allowed,
  }));
  return { ...publicConfig(current.config), actors };
}

export async function handleRunTurn(input: { message: string; operatorId: string }) {
  const { engine: current, planner: plan } = await getRuntime();
  const actor = resolveActor(input.operatorId, current.config.operators);
  if (!actor?.allowed) {
    return { handled: false, assistant: "", calls: [] as PublicCall[], mode: current.config.mode };
  }
  const result = await runToolLoop({
    text: input.message,
    actor,
    planner: plan,
    engine: current,
    config: current.config,
  });
  return { handled: result.handled, assistant: result.assistant, calls: result.calls, mode: current.config.mode };
}

export async function handleDecide(input: { approvalId: string; decision: "approve" | "reject"; operatorId: string }) {
  const { engine: current } = await getRuntime();
  const actor = resolveActor(input.operatorId, current.config.operators);
  if (!actor) {
    return { ok: false, error: "unknown actor", call: null as PublicCall | null };
  }
  const call = await current.decide(actor, input.approvalId, input.decision);
  return {
    ok: call.result !== "forbidden" && call.result !== "error",
    error: call.result === "forbidden" || call.result === "error" ? call.detail : null,
    call,
  };
}

export async function handleListAudit(operatorId: string) {
  const { engine: current } = await getRuntime();
  const actor = resolveActor(operatorId, current.config.operators);
  if (!actor?.allowed) return { forbidden: true, records: [] };
  return { forbidden: false, records: await current.audit.list() };
}
