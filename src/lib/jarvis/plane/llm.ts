export type ModelJob = "intent" | "coding" | "sensitive";

export function routeModel(job: ModelJob, env: NodeJS.ProcessEnv = process.env): { provider: string; model: string; permission: "unchanged" } {
  if (job === "sensitive" || env.JARVIS_LLM_LOCAL === "1") return { provider: "ollama", model: "local", permission: "unchanged" };
  if (job === "coding") return { provider: env.JARVIS_LLM_CODING ?? "unconfigured", model: "strong", permission: "unchanged" };
  return { provider: env.JARVIS_LLM_INTENT ?? "unconfigured", model: "small", permission: "unchanged" };
}

export function agentMayEscalate(): false {
  return false;
}
