export type AgentMode = "parallel" | "sequential" | "critic";
export type AgentRole = "collector" | "analyst" | "implementer" | "critic";

export type AgentStep = {
  id: string;
  role: AgentRole;
  dependsOn: string[];
  mayExecute: false;
  permission: "unchanged";
};

export type AgentPlan = {
  mode: AgentMode;
  notes: string[];
  permission: "unchanged";
  mayExecute: false;
  steps: AgentStep[];
};

function step(id: string, role: AgentRole, dependsOn: string[] = []): AgentStep {
  return { id, role, dependsOn, mayExecute: false, permission: "unchanged" };
}

export function planAgents(mode: AgentMode): AgentStep[] {
  if (mode === "parallel") {
    return [
      step("analysis-a", "analyst"),
      step("analysis-b", "analyst"),
      step("critic", "critic", ["analysis-a", "analysis-b"]),
    ];
  }
  if (mode === "sequential") {
    return [
      step("collect", "collector"),
      step("analyze", "analyst", ["collect"]),
      step("critic", "critic", ["analyze"]),
    ];
  }
  return [
    step("analyze", "analyst"),
    step("critic", "critic", ["analyze"]),
  ];
}

export function runAgents(mode: AgentMode, notes: string[]): AgentPlan {
  return {
    mode,
    notes: notes.filter(Boolean).slice(0, 100),
    permission: "unchanged",
    mayExecute: false,
    steps: planAgents(mode),
  };
}

export function agentOutputMayCallExecutor(): false {
  return false;
}
