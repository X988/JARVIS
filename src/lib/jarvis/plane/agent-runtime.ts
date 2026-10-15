import { canExecute, type Session } from "../server/session.ts";
import {
  processRegisteredReadOnlyTool,
  type Mode,
} from "../server/pipeline.ts";
import type { FetchLike } from "./llm-client.ts";
import { planAgentTurn, type AgentPlan, type AgentPlanStep } from "./agent-planner.ts";
import { driveAgentLoop, type AgentRunState, type CauseStatus, type Understanding } from "./agent-loop.ts";
import { searchMemory } from "./memory.ts";

export type AgentObservation = {
  tool: string;
  target: string;
  code: string;
  detail: string;
  verification: string;
  executionCalled: boolean;
  auditId: string | null;
  injection?: boolean;
};

export type AgentTurnResult = {
  code: string;
  answer: string;
  plan: AgentPlan | null;
  observations: AgentObservation[];
  provider: string | null;
  model: string | null;
  phase?: AgentRunState["phase"];
  cause?: CauseStatus;
  replanned?: boolean;
  runId?: string;
  understanding?: Understanding;
};

type Planner = typeof planAgentTurn;
type ToolRunner = typeof processRegisteredReadOnlyTool;

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
    requestId?: string;
    replan?: (input: { request: string; observations: AgentObservation[]; target: string }) => AgentPlanStep | null;
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
  if (!opts.session || !canExecute(opts.session.role)) {
    return {
      code: opts.session ? "ACTOR_DENIED" : "AUTH_REQUIRED",
      answer: "AI agent requires an authenticated operator session.",
      plan: null,
      observations: [],
      provider: null,
      model: null,
    };
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
    const recall = /уже была|похож|раньше|инцидент|повторя/i.test(text);
    const hits = recall
      ? searchMemory(opts.stateDir, text, { kinds: ["incident"], limit: 3, readerRole: opts.session.role })
      : [];
    const answer = recall
      ? hits.length
        ? [
            "1. Что обнаружено.",
            ...hits.map((hit) => `${hit.at} ${hit.source}: ${hit.snippet}`),
            "2. Чем подтверждается.",
            "Запись памяти с источником и временем. Это не новая диагностика.",
            "3. Причина и предположения.",
            "Повторная причина не подтверждается, пока нет нового наблюдения.",
          ].join("\n")
        : "В памяти нет подтверждённого похожего инцидента. Причина не установлена."
      : planned.plan.message;
    return {
      code: "OK",
      answer,
      plan: planned.plan,
      observations: [],
      provider: planned.provider,
      model: planned.model,
      cause: recall && hits.length ? "hypothesis" : recall ? "unestablished" : undefined,
    };
  }

  const runner = opts.toolRunner ?? processRegisteredReadOnlyTool;
  const loop = await driveAgentLoop({
    request: text,
    plan: planned.plan,
    session: opts.session,
    stateDir: opts.stateDir,
    runId: opts.requestId,
    now: opts.now,
    mode: opts.mode,
    env,
    toolRunner: runner,
    replan: opts.replan
      ? (input) => opts.replan?.({ request: input.request, observations: input.observations, target: input.target }) ?? null
      : undefined,
  });
  const observations: AgentObservation[] = loop.observations;

  const blockedMutation = observations.some((item) => item.code === "MUTATION_REQUIRES_APPROVAL");
  const hasFailure = observations.some(
    (item) => !["OK", "MOCK", "DRY_RUN", "MUTATION_REQUIRES_APPROVAL"].includes(item.code),
  );
  const allDryRun = observations.length > 0 && observations.every((item) => item.code === "DRY_RUN");
  const timedOut = loop.phase === "failed";

  return {
    code: loop.cancelled
      ? "AGENT_CANCELLED"
      : blockedMutation
        ? "MUTATION_REQUIRES_APPROVAL"
        : timedOut
          ? "AGENT_TIMEOUT"
          : hasFailure
            ? observations.some((item) => item.code === "OK" || item.code === "MOCK")
              ? "AGENT_PARTIAL"
              : "INSUFFICIENT_EVIDENCE"
            : allDryRun
              ? "DRY_RUN"
              : "OK",
    answer: loop.answer,
    plan: { ...planned.plan, steps: loop.steps },
    observations,
    provider: planned.provider,
    model: planned.model,
    phase: loop.phase,
    cause: loop.cause,
    replanned: loop.replanned,
    runId: loop.id,
    understanding: loop.understanding,
  };
}
