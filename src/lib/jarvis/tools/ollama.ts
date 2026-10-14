import { toolSchemas } from "./registry.ts";
import type { ChatMessage, Plan, ToolCall, ToolConfig, ToolSchema } from "./types.ts";

export function toolSystemPrompt(config: ToolConfig): string {
  return [
    "You are JARVIS, a sysadmin assistant. Use only the provided tools.",
    "If the request is not about SSH or MikroTik, do not call a tool.",
    "Read-only tools may run immediately. Change tools are held until a human presses Approve or Reject. Do not claim a change already ran.",
    `SSH read allowlist: ${config.sshAllowRead.join(" | ")}`,
    `SSH change allowlist: ${config.sshAllowChange.join(" | ")}`,
    "Never use shell operators, pipes, redirects, command substitution, or commands outside the allowlist.",
    `SSH hosts: ${config.sshHosts.map((host) => host.alias).join(", ")}`,
    `Router alias: ${config.mikrotik.alias}`,
    "Do not ask for or repeat passwords, keys, or tokens.",
  ].join("\n");
}

function asArgs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function parseOllamaChat(payload: unknown): Plan {
  const message = (payload as { message?: { content?: unknown; tool_calls?: unknown } } | null)?.message;
  const text = typeof message?.content === "string" ? message.content : "";
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCall[] = [];
  for (const item of rawCalls) {
    const fn = (item as { function?: { name?: unknown; arguments?: unknown } }).function;
    if (!fn || typeof fn.name !== "string" || !fn.name.trim()) continue;
    toolCalls.push({ name: fn.name.trim(), args: asArgs(fn.arguments) });
  }
  return { text, toolCalls };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function planWithOllama(options: {
  messages: ChatMessage[];
  tools: ToolSchema[];
  config: ToolConfig;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<Plan | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? options.config.ollamaTimeoutMs);
  try {
    const response = await fetchImpl(`${options.config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.config.ollamaModel,
        stream: false,
        messages: options.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.toolName ? { tool_name: message.toolName } : {}),
        })),
        tools: options.tools,
      }),
    });
    if (!response.ok) return null;
    return parseOllamaChat(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function schemasForPrompt(): ToolSchema[] {
  return toolSchemas();
}
