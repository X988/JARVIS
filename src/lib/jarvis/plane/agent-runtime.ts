import { canExecute, sessionUsable, type Session } from "../server/session.ts";
import {
  processRegisteredReadOnlyTool,
  type Mode,
} from "../server/pipeline.ts";
import { INVENTORY, targetById } from "../server/inventory.ts";
import { callJsonModel, type FetchLike } from "./llm-client.ts";
import { planAgentTurn, type AgentPlan, type AgentPlanResult, type AgentPlanStep } from "./agent-planner.ts";
import { runbookById } from "../server/runbooks.ts";
import { driveAgentLoop, type AgentRunState, type CauseStatus, type Understanding } from "./agent-loop.ts";
import { searchMemory } from "./memory.ts";
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
  injection?: boolean;
};

export type AgentTurnResult = {
  code: string;
  answer: string;
  plan: AgentPlan | null;
  observations: AgentObservation[];
  provider: string | null;
  model: string | null;
  sources?: string[];
  phase?: AgentRunState["phase"];
  cause?: CauseStatus;
  replanned?: boolean;
  runId?: string;
  understanding?: Understanding;
};

type Planner = typeof planAgentTurn;
type ToolRunner = typeof processRegisteredReadOnlyTool;
type Retriever = typeof retrieveKnowledge;

// Questions about live state must reach the tools, not the static knowledge base.
const LIVE_QUERY = /(загрузк|нагрузк|сейчас|текущ|аптайм|uptime|cpu|процессор|памят|аренд|lease|интерфейс|interface|лог[иа ]|журнал роутера|маршрут|статус|состояни|онлайн|работает ли|покажи|проверь)/iu;
const NO_ANSWER = /(отсутству|нет (информац|данных|сведений)|не (знаю|указан|содержит))/iu;

const INFO_QUESTION = /^(как|что|где|какой|какая|какое|какие|кто|зачем|почему|сколько|расскажи|объясни|how|what|where|which|who|why)(?=[\s,?!]|$)/iu;

/** Question-form informational turn that should be answered from knowledge, not tools/commands. */
export function isKnowledgeQuestion(text: string): boolean {
  const clean = text.trim();
  return INFO_QUESTION.test(clean) && !LIVE_QUERY.test(clean) && !RECALL_QUERY.test(clean);
}

/** "Проведи диагностику сети", "проверь сеть", "что с сетью" → fixed read-only router checks. */
export const NETWORK_DIAG = /(диагност\S*\s+(?:\S+\s+)?сет|провер\S*\s+(?:\S+\s+)?сет[ьи]|что\s+с\s+сетью|сеть\s+(?:тормозит|не работает|глючит))/iu;

export function networkDiagnosisPlan(): AgentPlanResult {
  const router = runbookById("mikrotik.status")?.targets[0] ?? "rb5009";
  const step = (tool: string, reason: string) => ({ tool, target: router, reason });
  return {
    ok: true,
    provider: "rules",
    model: "network-diagnosis",
    requestId: null,
    plan: {
      objective: "Диагностика сети: роутер, интерфейсы, маршруты, журнал",
      responseMode: "execute",
      message: "",
      steps: [
        step("mikrotik.status", "загрузка и аптайм роутера"),
        step("mikrotik.interfaces", "какие интерфейсы не подняты"),
        step("mikrotik.routes", "есть ли активный маршрут по умолчанию"),
        step("mikrotik.logs", "ошибки и предупреждения в журнале"),
      ],
    },
  };
}

const RECALL_QUERY = /уже был|похож|раньше|инцидент|повторя/iu;
const CHECK_NOW = /(проверь|покажи|диагност|посмотри)/iu;
export const NO_INCIDENTS_ANSWER =
  "Записей о похожих инцидентах пока нет. Могу проверить текущее состояние — скажите, например, «проверь роутер».";

/** Every inventory id replaced by its display name; used on all user-facing agent text. */
export function humanizeAll(text: string): string {
  try {
    return humanizeTargets(text, INVENTORY.map((t) => t.id));
  } catch {
    return text;
  }
}

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

/** Human name for a target id in user-facing text (internal ids stay in policy/audit). */
function targetLabel(id: string): string {
  try {
    return targetById(id)?.displayName ?? id;
  } catch {
    return id;
  }
}

/** Replace internal target ids (e.g. rb5009) with their display names in user-facing text. */
export function humanizeTargets(text: string, ids: string[]): string {
  let out = text;
  for (const id of new Set(ids)) {
    const label = targetLabel(id);
    if (label === id || !/^[a-z0-9_.-]+$/i.test(id)) continue;
    out = out.replace(new RegExp(`(?<![\\w-])${id.replace(/[.]/g, "\\.")}(?![\\w-])`, "gi"), label);
  }
  return out;
}

export async function runAgentTurn(text: string, opts: AgentTurnOptions): Promise<AgentTurnResult> {
  const result = await runAgentTurnInner(text, opts);
  return { ...result, answer: humanizeAll(result.answer) };
}

function memoryRecallAnswer(hits: { at: string; source: string; snippet: string }[]): string {
  return hits.length
    ? [
        "1. Что обнаружено.",
        ...hits.map((hit) => `${hit.at} ${hit.source}: ${hit.snippet}`),
        "2. Чем подтверждается.",
        "Запись памяти с источником и временем. Это не новая диагностика.",
        "3. Причина и предположения.",
        "Повторная причина не подтверждается, пока нет нового наблюдения.",
      ].join("\n")
    : NO_INCIDENTS_ANSWER;
}

type AgentTurnOptions = {
    session: Session | null;
    stateDir: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    mode?: Mode;
    fetch?: FetchLike;
    planner?: Planner;
    toolRunner?: ToolRunner;
    retriever?: Retriever;
    requestId?: string;
    replan?: (input: { request: string; observations: AgentObservation[]; target: string }) => AgentPlanStep | null;
    team?: unknown;
};

async function runAgentTurnInner(text: string, opts: AgentTurnOptions): Promise<AgentTurnResult> {
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

  // "Такое уже было раньше?" without a request to check now: answer from incident
  // memory only, plainly, and never with a clarifying question.
  if (RECALL_QUERY.test(text) && !CHECK_NOW.test(text)) {
    const remembered = searchMemory(opts.stateDir, text, { kinds: ["incident"], limit: 3, readerRole: opts.session.role });
    return {
      code: "OK",
      answer: memoryRecallAnswer(remembered),
      plan: null,
      observations: [],
      provider: null,
      model: null,
      cause: remembered.length ? "hypothesis" : "unestablished",
    };
  }

  const hits = await (opts.retriever ?? retrieveKnowledge)(text, { env, stateDir: opts.stateDir }).catch(() => [] as Hit[]);
  const sources = [...new Set(hits.map((hit) => hit.source))];

  // Informational "how/what/where" questions with a strong knowledge hit are answered
  // from the knowledge base directly, without running tools.
  const directScore = Number(env.JARVIS_KNOWLEDGE_DIRECT_SCORE) || 0.55;
  if (!NETWORK_DIAG.test(text) && INFO_QUESTION.test(text.trim()) && !LIVE_QUERY.test(text) && hits.length > 0 && hits[0].score >= directScore) {
    const grounded = await answerFromKnowledge(text, hits, "", { env, fetch: opts.fetch });
    if (grounded && !NO_ANSWER.test(grounded.answer)) {
      return { code: "OK", answer: grounded.answer, plan: null, observations: [], provider: grounded.provider, model: grounded.model, sources };
    }
  }

  const network = NETWORK_DIAG.test(text);
  const planner = network ? async () => networkDiagnosisPlan() : (opts.planner ?? planAgentTurn);
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
        : NO_INCIDENTS_ANSWER
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
    answer: humanizeTargets(loop.answer, observations.map((item) => item.target)),
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
