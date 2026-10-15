import { canExecute, sessionUsable, type Session } from "../server/session.ts";
import {
  processRegisteredReadOnlyTool,
  type Mode,
  type RegisteredToolResult,
} from "../server/pipeline.ts";
import { callJsonModel, type FetchLike } from "./llm-client.ts";
import { planAgentTurn, type AgentPlan } from "./agent-planner.ts";
import {
  confirmKnowledge,
  formatSources,
  parseKnowledgeCommand,
  proposeKnowledge,
  retrieveKnowledge,
  type Hit,
} from "../knowledge/rag.ts";

export type AgentObservation = {
  tool: string;
  target: string;
  code: string;
  detail: string;
  verification: string;
  executionCalled: boolean;
  auditId: string | null;
};

export type AgentTurnResult = {
  code: string;
  answer: string;
  plan: AgentPlan | null;
  observations: AgentObservation[];
  provider: string | null;
  model: string | null;
  sources?: string[];
};

type Planner = typeof planAgentTurn;
type ToolRunner = typeof processRegisteredReadOnlyTool;
type Retriever = typeof retrieveKnowledge;

const INFO_QUESTION = /^(как|что|где|какой|какая|какое|какие|кто|зачем|почему|сколько|расскажи|объясни|how|what|where|which|who|why)(?=[\s,?!]|$)/iu;

async function answerFromKnowledge(
  request: string,
  hits: Hit[],
  draft: string,
  opts: { env: NodeJS.ProcessEnv; fetch?: FetchLike },
): Promise<{ answer: string; provider: string | null; model: string | null } | null> {
  const context = hits.map((hit) => ({ source: hit.source, section: hit.heading, text: redact(hit.text) }));
  const result = await callJsonModel(
    "sensitive",
    {
      system: [
        "You are JARVIS, an infrastructure assistant. Answer in Russian, concisely.",
        "Answer ONLY from the supplied knowledge snippets. If they do not contain the answer, say you don't know.",
        "Never invent IPs, hosts, commands or credentials. Never output secrets.",
        "End the answer with the source file name(s) in the form: Источник: <file>.",
      ].join("\n"),
      user: JSON.stringify({ question: request, knowledge: context, draftAnswer: draft }),
      schema: ANSWER_SCHEMA,
    },
    { env: opts.env, fetch: opts.fetch },
  );
  if (!result.ok || !result.value || typeof result.value !== "object") return null;
  const raw = (result.value as { answer?: unknown }).answer;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 4000) return null;
  let answer = raw.trim();
  if (!/Источник/i.test(answer)) answer = `${answer}\n${formatSources(hits)}`;
  return { answer, provider: result.provider, model: result.model };
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
  },
  required: ["answer"],
};

function redact(text: string): string {
  return text
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1500);
}

function fallbackAnswer(observations: AgentObservation[], message: string): string {
  if (observations.length === 0) return message || "Действия не выполнялись.";
  const lines = observations.map(
    (item) => `${item.tool}@${item.target}: ${item.code} — ${redact(item.detail)}`,
  );
  return [message, ...lines].filter(Boolean).join("\n");
}

async function synthesize(
  request: string,
  objective: string,
  observations: AgentObservation[],
  message: string,
  opts: { env: NodeJS.ProcessEnv; fetch?: FetchLike },
): Promise<{ answer: string; provider: string | null; model: string | null }> {
  const safeObservations = observations.map((item) => ({
    tool: item.tool,
    target: item.target,
    code: item.code,
    detail: redact(item.detail),
    verification: redact(item.verification),
    executionCalled: item.executionCalled,
  }));
  const result = await callJsonModel(
    "sensitive",
    {
      system: [
        "You are the response layer of JARVIS infrastructure control plane.",
        "Use only the supplied observations. Never invent host state, execution success, causes, credentials, or commands.",
        "Clearly distinguish OK, MOCK and DRY_RUN from real verified execution.",
        "If a step failed, state that it failed and do not infer a successful result.",
        "Do not output secrets. Keep the answer concise and technical.",
      ].join("\n"),
      user: JSON.stringify({ request, objective, message, observations: safeObservations }),
      schema: ANSWER_SCHEMA,
    },
    { env: opts.env, fetch: opts.fetch },
  );
  if (!result.ok || !result.value || typeof result.value !== "object") {
    return { answer: fallbackAnswer(observations, message), provider: null, model: null };
  }
  const answer = (result.value as { answer?: unknown }).answer;
  if (typeof answer !== "string" || !answer.trim() || answer.length > 4000) {
    return { answer: fallbackAnswer(observations, message), provider: null, model: null };
  }
  return { answer: answer.trim(), provider: result.provider, model: result.model };
}

export async function runAgentTurn(
  text: string,
  opts: {
    session: Session | null;
    stateDir: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    mode?: Mode;
    fetch?: FetchLike;
    planner?: Planner;
    toolRunner?: ToolRunner;
    retriever?: Retriever;
  },
): Promise<AgentTurnResult> {
  const env = opts.env ?? process.env;
  if (env.JARVIS_AI_AGENT_ENABLED !== "1") {
    return {
      code: "AGENT_DISABLED",
      answer: "AI agent disabled by server configuration.",
      plan: null,
      observations: [],
      provider: null,
      model: null,
    };
  }
  if (!sessionUsable(opts.session, opts.now?.getTime() ?? Date.now()) || !canExecute(opts.session.role)) {
    return {
      code: sessionUsable(opts.session, opts.now?.getTime() ?? Date.now()) ? "ACTOR_DENIED" : "AUTH_REQUIRED",
      answer: "AI agent requires an authenticated operator session.",
      plan: null,
      observations: [],
      provider: null,
      model: null,
    };
  }

  const knowledgeCommand = parseKnowledgeCommand(text);
  if (knowledgeCommand) {
    const actor = opts.session.accountId;
    const result =
      knowledgeCommand.kind === "propose"
        ? proposeKnowledge(knowledgeCommand.text, actor, opts.stateDir, opts.now?.getTime() ?? Date.now())
        : confirmKnowledge(knowledgeCommand.id, actor, opts.stateDir, opts.now ?? new Date());
    return { code: result.code, answer: result.answer, plan: null, observations: [], provider: null, model: null };
  }

  const hits = await (opts.retriever ?? retrieveKnowledge)(text, { env, stateDir: opts.stateDir }).catch(() => [] as Hit[]);
  const sources = [...new Set(hits.map((hit) => hit.source))];

  // Informational "how/what/where" questions with a strong knowledge hit are answered
  // from the knowledge base directly, without running tools.
  const directScore = Number(env.JARVIS_KNOWLEDGE_DIRECT_SCORE) || 0.55;
  if (INFO_QUESTION.test(text.trim()) && hits.length > 0 && hits[0].score >= directScore) {
    const grounded = await answerFromKnowledge(text, hits, "", { env, fetch: opts.fetch });
    if (grounded) {
      return { code: "OK", answer: grounded.answer, plan: null, observations: [], provider: grounded.provider, model: grounded.model, sources };
    }
  }

  const planner = opts.planner ?? planAgentTurn;
  const planned = await planner(text, { env, fetch: opts.fetch });
  if (!planned.ok) {
    return {
      code: planned.code,
      answer: planned.detail,
      plan: null,
      observations: [],
      provider: null,
      model: null,
    };
  }

  if ((planned.plan.responseMode === "answer" || planned.plan.responseMode === "clarify") && hits.length > 0) {
    const grounded = await answerFromKnowledge(text, hits, planned.plan.message, { env, fetch: opts.fetch });
    if (grounded) {
      return {
        code: "OK",
        answer: grounded.answer,
        plan: planned.plan,
        observations: [],
        provider: grounded.provider ?? planned.provider,
        model: grounded.model ?? planned.model,
        sources,
      };
    }
  }

  if (planned.plan.responseMode === "clarify") {
    return {
      code: "CLARIFY",
      answer: planned.plan.message,
      plan: planned.plan,
      observations: [],
      provider: planned.provider,
      model: planned.model,
    };
  }
  if (planned.plan.responseMode === "answer") {
    return {
      code: "OK",
      answer: planned.plan.message,
      plan: planned.plan,
      observations: [],
      provider: planned.provider,
      model: planned.model,
    };
  }

  const observations: AgentObservation[] = [];
  const runner = opts.toolRunner ?? processRegisteredReadOnlyTool;
  for (let index = 0; index < planned.plan.steps.length; index += 1) {
    const step = planned.plan.steps[index];
    // Every proposal, including a mutating one, is sent through the server
    // admission layer so denials are audited. That layer never calls the
    // executor for mutations.
    const result: RegisteredToolResult = runner({
      runbook: step.tool,
      target: step.target,
      requestId: `agent-${Date.now()}-${index}`,
      session: opts.session,
      stateDir: opts.stateDir,
      now: opts.now,
      mode: opts.mode,
      channel: "agent",
    });
    observations.push({
      tool: step.tool,
      target: step.target,
      code: result.code,
      detail: result.detail,
      verification: result.verification,
      executionCalled: result.executionCalled,
      auditId: result.auditId,
    });

    if (result.verdict === "deny" && result.code !== "DRY_RUN") break;
  }

  const blockedMutation = observations.some((item) => item.code === "MUTATION_REQUIRES_APPROVAL");
  const hasFailure = observations.some(
    (item) => !["OK", "MOCK", "DRY_RUN", "MUTATION_REQUIRES_APPROVAL"].includes(item.code),
  );
  const allDryRun = observations.length > 0 && observations.every((item) => item.code === "DRY_RUN");

  const final = await synthesize(
    text,
    planned.plan.objective,
    observations,
    planned.plan.message,
    { env, fetch: opts.fetch },
  );

  return {
    code: blockedMutation
      ? "MUTATION_REQUIRES_APPROVAL"
      : hasFailure
        ? "AGENT_PARTIAL"
        : allDryRun
          ? "DRY_RUN"
          : "OK",
    answer: final.answer,
    plan: planned.plan,
    observations,
    provider: final.provider ?? planned.provider,
    model: final.model ?? planned.model,
  };
}

