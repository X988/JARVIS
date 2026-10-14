import { admitRegisteredTool } from "./tool-registry.ts";

export type McpDiscovery =
  | { code: "DENY"; name: string; reason: string }
  | { code: "DISCOVERED"; name: string };

/**
 * Discovery is not execution authority. A known MCP capability still needs
 * a server-owned runbook and inventory target before it may reach Gateway.
 */
export function admitMcp(name: string, known: string[]): McpDiscovery {
  if (!known.includes(name)) {
    return { code: "DENY", name, reason: "MCP tool не опубликован" };
  }
  return { code: "DISCOVERED", name };
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
