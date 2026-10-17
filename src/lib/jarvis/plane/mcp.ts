import { admitRegisteredTool } from "./tool-registry.ts";

export type McpDiscovery =
  | { code: "DENY"; name: string; reason: string }
  | { code: "DISCOVERED"; name: string };

/**
 * Discovery is not execution authority.
 * Deny-by-default: only explicitly published MCP tools are discoverable.
 * Even then, a server-owned runbook + inventory target + Gateway is required.
 */
export function admitMcp(name: string, known: string[]): McpDiscovery {
  if (!known.includes(name)) {
    return { code: "DENY", name, reason: "MCP tool не опубликован (deny-by-default)" };
  }
  return { code: "DISCOVERED", name };
}

export function admitMcpRunbook(
  runbook: string,
  target: string,
  exposedRunbooks: string[],
): { code: "DENY" | "GATEWAY"; runbook: string; target: string; reason?: string } {
  if (!exposedRunbooks.includes(runbook)) {
    return { code: "DENY", runbook, target, reason: "MCP capability не опубликована (deny-by-default)" };
  }
  const admission = admitRegisteredTool(runbook, target);
  if (admission.code === "DENY") {
    return { code: "DENY", runbook, target, reason: admission.reason };
  }
  return { code: "GATEWAY", runbook, target: admission.target };
}
