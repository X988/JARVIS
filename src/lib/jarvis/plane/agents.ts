export type AgentMode = "parallel" | "sequential" | "critic";

export function runAgents(mode: AgentMode, notes: string[]): { mode: AgentMode; notes: string[]; permission: "unchanged"; mayExecute: false } {
  return { mode, notes: notes.filter(Boolean), permission: "unchanged", mayExecute: false };
}
