import { matchIntent } from "../model.ts";
import { runbookForIntent } from "../server/runbooks.ts";
import {
  processCommand,
  type Mode,
  type PipelineResult,
} from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";
import {
  runAgentTurn,
  humanizeAll,
  isKnowledgeQuestion,
  type AgentTurnResult,
} from "./agent-runtime.ts";
import type { FetchLike } from "./llm-client.ts";

export type HybridTurnResult =
  | ({ kind: "command" } & PipelineResult)
  | ({ kind: "agent" } & AgentTurnResult);

const SHORT_CONFIRM = /^(да|yes|ok|ага|подтверждаю)$/i;
const DYNAMIC_ONEC = /Выполнить\s*\(/i;

export function deterministicFirst(text: string): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (SHORT_CONFIRM.test(clean) || DYNAMIC_ONEC.test(clean)) return true;
  return matchIntent(clean) !== "unknown";
}

/**
 * Which path a turn takes. Question-form informational turns ("Как откатить…?",
 * "Где работает…?") go to the agent, which answers them from the knowledge base.
 * In real mode, intents without a registered runbook (demo-only commands such as
 * rollback_project) are not offered at all.
 */
export function routeDeterministic(text: string, mode: string | undefined): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (SHORT_CONFIRM.test(clean) || DYNAMIC_ONEC.test(clean)) return true;
  if (isKnowledgeQuestion(clean)) return false;
  const intent = matchIntent(clean);
  if (intent === "unknown") return false;
  if (mode === "real" && !runbookForIntent(intent)) return false;
  return true;
}

/** Display-only copy: internal target ids replaced by inventory display names. */
function humanizeCommand(result: PipelineResult): PipelineResult {
  const decision = { ...result.decision };
  for (const key of ["reason", "title", "denyReason", "clarifyReason"] as const) {
    const value = (decision as Record<string, unknown>)[key];
    if (typeof value === "string") (decision as Record<string, unknown>)[key] = humanizeAll(value);
  }
  return { ...result, decision };
}

export async function runHybridTurn(
  text: string,
  opts: {
    session: Session | null;
    stateDir: string;
    requestId: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    mode?: Mode;
    fetch?: FetchLike;
    agent?: typeof runAgentTurn;
    command?: typeof processCommand;
  },
): Promise<HybridTurnResult> {
  const command = opts.command ?? processCommand;
  const agent = opts.agent ?? runAgentTurn;

  const mode = opts.mode ?? (opts.env ?? process.env).EXECUTION_MODE;
  if (routeDeterministic(text, mode)) {
    const result = command({
      text,
      requestId: opts.requestId,
      session: opts.session,
      stateDir: opts.stateDir,
      now: opts.now,
      mode: opts.mode,
    });
    return { kind: "command", ...humanizeCommand(result) };
  }

  const ai = await agent(text, {
    session: opts.session,
    stateDir: opts.stateDir,
    env: opts.env,
    now: opts.now,
    mode: opts.mode,
    fetch: opts.fetch,
  });

  if (ai.code === "MUTATION_REQUIRES_APPROVAL") {
    // The model is not allowed to construct an approval. Re-run the original
    // user text through the deterministic command pipeline. Only that pipeline
    // may derive a runbook, target, parameters and approval hash.
    const fallback = command({
      text,
      requestId: opts.requestId.slice(0, 150) + "-approval",
      session: opts.session,
      stateDir: opts.stateDir,
      now: opts.now,
      mode: opts.mode,
    });
    if (fallback.code !== "RUNBOOK_NOT_FOUND" && fallback.code !== "TARGET_NOT_FOUND") {
      return { kind: "command", ...fallback };
    }
  }

  return { kind: "agent", ...ai };
}
