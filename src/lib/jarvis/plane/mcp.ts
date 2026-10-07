import { admitRegisteredTool } from "./tool-registry.ts";

export function admitMcp(name: string, known: string[]): { code: "DENY" | "GATEWAY"; name: string } {
  if (!known.includes(name)) return { code: "DENY", name };
  return { code: "GATEWAY", name };
}

export function admitMcpRunbook(
  runbook: string,
  target: string,
  exposedRunbooks: string[],
): { code: "DENY" | "GATEWAY"; runbook: string; target: string; reason?: string } {
  if (!exposedRunbooks.includes(runbook)) {
    return { code: "DENY", runbook, target, reason: "MCP capability не опубликована" };
  }
  const admission = admitRegisteredTool(runbook, target);
  if (admission.code === "DENY") {
    return { code: "DENY", runbook, target, reason: admission.reason };
  }
  return { code: "GATEWAY", runbook, target: admission.target };
}
