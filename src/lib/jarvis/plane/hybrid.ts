import { matchIntent } from "../model.ts";
import {
  processCommand,
  type Mode,
  type PipelineResult,
} from "../server/pipeline.ts";
import type { Session } from "../server/session.ts";
import {
  runAgentTurn,
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

  if (deterministicFirst(text)) {
    const result = command({
      text,
      requestId: opts.requestId,
      session: opts.session,
      stateDir: opts.stateDir,
      now: opts.now,
      mode: opts.mode,
    });
    return { kind: "command", ...result };
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
