import type { Constraint, InventoryTarget, PolicyVerdict, RunbookDefinition } from "./types.ts";

export type PolicyDecision = { verdict: PolicyVerdict; reason: string };

const ABSOLUTE: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(drop|delete|удал(и|ить|ение))\b.*\b(database|db|баз[ауые])\b/i, reason:"Production database destructive operations are DENY_ALWAYS." },
  { pattern: /\bgit\s+push\b.*\b(main|master)\b/i, reason:"Direct push to main/master is DENY_ALWAYS." },
  { pattern: /Выполнить\s*\(/iu, reason:"1C dynamic execute is DENY_ALWAYS." },
  { pattern: /\b(cf|конфигурац\w*)\b.*\b(production|prod|боев\w*|рабоч\w*)\b.*\b(load|deploy|загруз|обнов)/iu, reason:"Direct production CF deployment is DENY_ALWAYS." },
  { pattern: /\b(shell|bash|cmd|powershell)\b.*\b(production|prod|боев\w*)\b/iu, reason:"Arbitrary production shell is DENY_ALWAYS." },
];

export function absolutePolicy(text: string): PolicyDecision | null {
  const hit = ABSOLUTE.find((item) => item.pattern.test(text));
  return hit ? { verdict:"DENY_ALWAYS", reason:hit.reason } : null;
}

export function evaluatePolicy(args: { raw: string; constraints: Constraint[]; runbook: RunbookDefinition; target: InventoryTarget }): PolicyDecision {
  const absolute = absolutePolicy(args.raw);
  if (absolute) return absolute;
  if (!args.target.enabled || !args.target.allowedRunbooks.includes(args.runbook.id)) return { verdict:"DENY_ALWAYS", reason:"Runbook is not allowed for this inventory target." };
  if (!args.runbook.targetTypes.includes(args.target.type)) return { verdict:"DENY_ALWAYS", reason:"Runbook target type mismatch." };
  if (args.constraints.includes("NO_CHANGE") && args.runbook.mutating) return { verdict:"DENY_ALWAYS", reason:"NO_CHANGE forbids mutating runbooks." };
  if (args.runbook.approvalMode !== "none") return { verdict:"APPROVAL_REQUIRED", reason:"This runbook requires server-side approval." };
  return { verdict:"ALLOW", reason:"Runbook and target are allowed by server policy." };
}
