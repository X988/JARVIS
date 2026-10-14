import { heuristicPlan } from "./heuristic.ts";
import { planWithOllama, toolSystemPrompt, type FetchLike } from "./ollama.ts";
import { toolSchemas } from "./registry.ts";
import type { ToolEngine } from "./engine.ts";
import type { Actor, ChatMessage, Plan, PublicCall, ToolConfig, ToolSchema } from "./types.ts";

export type Planner = (messages: ChatMessage[], tools: ToolSchema[]) => Promise<Plan>;

export function createPlanner(config: ToolConfig, fetchImpl?: FetchLike): Planner {
  return async (messages, tools) => {
    const ollama = await planWithOllama({ messages, tools, config, fetchImpl });
    const hasToolRound = messages.some((message) => message.role === "tool");
    if (ollama && ollama.toolCalls.length > 0) return ollama;
    if (!hasToolRound) {
      const user = [...messages].reverse().find((message) => message.role === "user");
      const heuristic = heuristicPlan(user?.content ?? "");
      if (heuristic.toolCalls.length > 0) return heuristic;
    }
    if (ollama) return ollama;
    return { text: "", toolCalls: [] };
  };
}

export async function runToolLoop(options: {
  text: string;
  actor: Actor;
  planner: Planner;
  engine: ToolEngine;
  config: ToolConfig;
  maxRounds?: number;
  maxCalls?: number;
}): Promise<{ handled: boolean; assistant: string; calls: PublicCall[] }> {
  const tools = toolSchemas();
  const messages: ChatMessage[] = [
    { role: "system", content: toolSystemPrompt(options.config) },
    { role: "user", content: options.text },
  ];
  const calls: PublicCall[] = [];
  const maxRounds = options.maxRounds ?? 3;
  const maxCalls = options.maxCalls ?? 4;
  let assistant = "";
  for (let round = 0; round < maxRounds; round += 1) {
    let planned: Plan;
    try {
      planned = await options.planner(messages, tools);
    } catch {
      if (round === 0 && calls.length === 0) return { handled: false, assistant: "", calls: [] };
      break;
    }
    if (planned.text) assistant = planned.text;
    if (planned.toolCalls.length === 0) {
      if (round === 0) return { handled: false, assistant: "", calls: [] };
      break;
    }
    let held = false;
    for (const toolCall of planned.toolCalls) {
      if (calls.length >= maxCalls) break;
      const result = await options.engine.call(options.actor, toolCall);
      calls.push(result);
      messages.push({
        role: "tool",
        toolName: result.tool,
        content: `${result.result}: ${result.detail}`.slice(0, 4000),
      });
      if (result.result === "awaiting_approval") held = true;
    }
    if (held || calls.length >= maxCalls) break;
  }
  if (calls.length === 0) return { handled: false, assistant: "", calls: [] };
  if (!assistant) assistant = calls.map((call) => `${call.tool} ${call.result}`).join(" · ");
  return { handled: true, assistant, calls };
}
