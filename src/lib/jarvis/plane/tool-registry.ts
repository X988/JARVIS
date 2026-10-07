import { targetById } from "../server/inventory.ts";
import { listRunbooks, runbookById } from "../server/runbooks.ts";

export type ToolSpec = {
  name: string;
  title: string;
  schema: string[];
  risk: 0 | 1 | 2 | 3;
  mutates: boolean;
  executor: string;
  runbook: string;
  allowedTargets: string[];
  audit: true;
  verification: string;
  policy: string;
};

export type ToolAdmission =
  | { code: "GATEWAY"; tool: ToolSpec; target: string }
  | { code: "DENY"; reason: string };

export function listTools(): ToolSpec[] {
  return listRunbooks().map((book) => ({
    name: book.id,
    title: book.title,
    schema: [...book.inputSchema],
    risk: book.risk,
    mutates: book.mutates,
    executor: book.executor,
    runbook: book.id,
    allowedTargets: [...book.targets],
    audit: true,
    verification: book.verification,
    policy: book.policy,
  }));
}

export function toolByName(name: string): ToolSpec | null {
  const book = runbookById(name);
  if (!book) return null;
  return {
    name: book.id,
    title: book.title,
    schema: [...book.inputSchema],
    risk: book.risk,
    mutates: book.mutates,
    executor: book.executor,
    runbook: book.id,
    allowedTargets: [...book.targets],
    audit: true,
    verification: book.verification,
    policy: book.policy,
  };
}

export function admitRegisteredTool(name: string, targetId: string): ToolAdmission {
  const tool = toolByName(name);
  if (!tool) return { code: "DENY", reason: "tool отсутствует в Runbook Registry" };
  const target = targetById(targetId);
  if (!target) return { code: "DENY", reason: "target отсутствует в Inventory" };
  if (tool.allowedTargets.length > 0 && !tool.allowedTargets.includes(target.id)) {
    return { code: "DENY", reason: "runbook не разрешён для target" };
  }
  if (!target.allowedRunbooks.includes(tool.runbook)) {
    return { code: "DENY", reason: "Inventory не разрешает этот runbook" };
  }
  if (tool.policy === "DENY_ALWAYS") {
    return { code: "DENY", reason: "DENY_ALWAYS не может быть вызван tool layer" };
  }
  return { code: "GATEWAY", tool, target: target.id };
}
