export type ModelJob = "intent" | "coding" | "sensitive" | "research" | "critic";
export type LLMProviderId = "openai" | "anthropic" | "gemini" | "ollama" | "unconfigured";

export type LLMProvider = {
  id: LLMProviderId;
  model: string;
  local: boolean;
  configured: boolean;
  credentialRef: string | null;
  endpointRef: string | null;
};

const PROVIDER_SECRET: Record<Exclude<LLMProviderId, "unconfigured">, string | null> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  ollama: null,
};

function providerId(value: string | undefined): LLMProviderId {
  const clean = value?.trim().toLowerCase();
  if (clean === "openai" || clean === "anthropic" || clean === "gemini" || clean === "ollama") return clean;
  return "unconfigured";
}

function modelFor(id: LLMProviderId, raw: string | undefined): string {
  if (raw?.trim()) return raw.trim();
  if (id === "ollama") return "local";
  return "unconfigured";
}

function routedModel(
  id: LLMProviderId,
  explicit: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (explicit?.trim()) return explicit.trim();
  if (id === "unconfigured") return "unconfigured";
  return modelFor(id, env[`JARVIS_${id.toUpperCase()}_MODEL`]);
}

export function providerDescriptor(
  id: LLMProviderId,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): LLMProvider {
  if (id === "unconfigured") {
    return { id, model: "unconfigured", local: false, configured: false, credentialRef: null, endpointRef: null };
  }
  const secret = PROVIDER_SECRET[id];
  const configured = id === "ollama"
    ? Boolean(env.JARVIS_OLLAMA_URL?.trim() || env.JARVIS_LLM_LOCAL === "1")
    : Boolean(secret && env[secret]?.trim());
  return {
    id,
    model,
    local: id === "ollama",
    configured,
    credentialRef: secret,
    endpointRef: id === "ollama" ? "JARVIS_OLLAMA_URL" : null,
  };
}

export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProvider[] {
  const ids: Exclude<LLMProviderId, "unconfigured">[] = ["openai", "anthropic", "gemini", "ollama"];
  return ids.map((id) => providerDescriptor(id, modelFor(id, env[`JARVIS_${id.toUpperCase()}_MODEL`]), env));
}

function routed(job: ModelJob, env: NodeJS.ProcessEnv): { id: LLMProviderId; model: string } {
  if (job === "sensitive") {
    const local = providerId(env.JARVIS_LLM_SENSITIVE_PROVIDER || (env.JARVIS_LLM_LOCAL === "1" ? "ollama" : undefined));
    return { id: local, model: routedModel(local, env.JARVIS_LLM_SENSITIVE_MODEL, env) };
  }
  if (job === "coding") {
    const id = providerId(env.JARVIS_LLM_CODING_PROVIDER || env.JARVIS_LLM_CODING);
    return { id, model: routedModel(id, env.JARVIS_LLM_CODING_MODEL, env) };
  }
  if (job === "research") {
    const id = providerId(env.JARVIS_LLM_RESEARCH_PROVIDER || env.JARVIS_LLM_CODING_PROVIDER);
    return { id, model: routedModel(id, env.JARVIS_LLM_RESEARCH_MODEL || env.JARVIS_LLM_CODING_MODEL, env) };
  }
  if (job === "critic") {
    const id = providerId(env.JARVIS_LLM_CRITIC_PROVIDER || env.JARVIS_LLM_CODING_PROVIDER);
    return { id, model: routedModel(id, env.JARVIS_LLM_CRITIC_MODEL || env.JARVIS_LLM_CODING_MODEL, env) };
  }
  const id = providerId(env.JARVIS_LLM_INTENT_PROVIDER || env.JARVIS_LLM_INTENT);
  return { id, model: routedModel(id, env.JARVIS_LLM_INTENT_MODEL, env) };
}

export function routeModel(
  job: ModelJob,
  env: NodeJS.ProcessEnv = process.env,
): { provider: LLMProviderId; model: string; permission: "unchanged"; configured: boolean; local: boolean } {
  const choice = routed(job, env);
  const descriptor = providerDescriptor(choice.id, choice.model, env);
  return {
    provider: descriptor.id,
    model: descriptor.model,
    permission: "unchanged",
    configured: descriptor.configured,
    local: descriptor.local,
  };
}

export function agentMayEscalate(): false {
  return false;
}

export function llmMayReceiveSecretValues(): false {
  return false;
}
