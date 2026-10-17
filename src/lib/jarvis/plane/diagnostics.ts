import { admitRegisteredTool } from "./tool-registry.ts";
import type { AgentPlanStep } from "./agent-planner.ts";
import { runbookById } from "../server/runbooks.ts";

export type DiagnosticRisk = "read";

export type DiagnosticTool = {
  id: string;
  system: "windows" | "ad" | "linux" | "sql" | "mikrotik" | "mail";
  roles: Array<"admin" | "operator">;
  risk: DiagnosticRisk;
  timeoutSec: number;
  inputs: string[];
  live: "fixed-probe" | "inventory-unbound" | "route-evidence-only";
};

const TOOLS: DiagnosticTool[] = [
  { id: "windows.reachability", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.services", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 45, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.events", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 45, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.dns", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.memory", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.time", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "windows.tasks", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 45, inputs: ["target"], live: "fixed-probe" },
  { id: "ad.replication", system: "ad", roles: ["admin", "operator"], risk: "read", timeoutSec: 60, inputs: ["target"], live: "fixed-probe" },
  { id: "ad.accounts", system: "ad", roles: ["admin", "operator"], risk: "read", timeoutSec: 60, inputs: ["target"], live: "fixed-probe" },
  { id: "linux.systemd", system: "linux", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "linux.docker", system: "linux", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "linux.filesystem", system: "linux", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "linux.postgres", system: "linux", roles: ["admin", "operator"], risk: "read", timeoutSec: 20, inputs: ["target"], live: "inventory-unbound" },
  { id: "linux.http", system: "linux", roles: ["admin", "operator"], risk: "read", timeoutSec: 20, inputs: ["target"], live: "fixed-probe" },
  { id: "sql.agent", system: "sql", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "sql.errors", system: "sql", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "sql.space", system: "sql", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "mikrotik.resources", system: "mikrotik", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "mikrotik.vlan", system: "mikrotik", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "mikrotik.reachability", system: "mikrotik", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "route-evidence-only" },
  { id: "server.health", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 60, inputs: ["target"], live: "fixed-probe" },
  { id: "disk.check", system: "windows", roles: ["admin", "operator"], risk: "read", timeoutSec: 60, inputs: ["target"], live: "fixed-probe" },
  { id: "mailcow.health", system: "mail", roles: ["admin", "operator"], risk: "read", timeoutSec: 90, inputs: ["target"], live: "fixed-probe" },
  { id: "wireguard.status", system: "mikrotik", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
  { id: "mikrotik.wireguard", system: "mikrotik", roles: ["admin", "operator"], risk: "read", timeoutSec: 30, inputs: ["target"], live: "fixed-probe" },
];

const ABNORMAL =
  /CONNECT_FAILED|EXECUTION_TIMEOUT|VERIFICATION_FAILED|NOT_CONFIGURED|ADAPTER_DISABLED|cpu_pct=9\d|cpu=9\d|cpu_load=9\d|failed_auto_services=[1-9]|failed_services=[1-9]|stopped=[1-9]|worst_used_pct=9\d|queue=[1-9]|unhealthy=[1-9]|stale_or_never=[1-9]|replication_failures=[1-9]|active_defaults=0|error_level=[1-9]/;

export function listDiagnosticTools(): DiagnosticTool[] {
  return TOOLS.map((tool) => ({ ...tool, roles: [...tool.roles], inputs: [...tool.inputs] }));
}

export function diagnosticTool(id: string): DiagnosticTool | null {
  return listDiagnosticTools().find((tool) => tool.id === id) ?? null;
}

export function observationAbnormal(text: string): boolean {
  return ABNORMAL.test(text);
}

type PlayStep = { tool: string; reason: string };

const PLAYBOOKS: Array<{ id: string; when: RegExp; steps: PlayStep[] }> = [
  {
    id: "windows-slow",
    when: /медлен|тормоз|slow|cpu/i,
    steps: [
      { tool: "server.health", reason: "read-only host health" },
      { tool: "disk.check", reason: "disk pressure after an abnormal health reading" },
      { tool: "windows.services", reason: "allowed service states after the first reading stayed abnormal" },
      { tool: "windows.memory", reason: "memory reading when the health text did not include memory" },
    ],
  },
  {
    id: "mail-send",
    when: /почт|mailcow|не отправ|mail/i,
    steps: [
      { tool: "mailcow.health", reason: "mailcow compose and queue" },
      { tool: "disk.check", reason: "mailbox disk after an abnormal mail reading" },
      { tool: "linux.systemd", reason: "failed units after mail reading stayed abnormal" },
    ],
  },
  {
    id: "wireguard",
    when: /wireguard|вайргард|туннел/i,
    steps: [
      { tool: "wireguard.status", reason: "wireguard peer handshake" },
      { tool: "mikrotik.wireguard", reason: "second read-only peer view on the same vpn target" },
    ],
  },
];

export function playbookFor(request: string): string | null {
  const text = request.toLocaleLowerCase("ru-RU");
  if (/медлен|тормоз|slow/.test(text) && /windows|сервер|dc01|контроллер|\bdc\b/.test(text)) return "windows-slow";
  if (/почт|mailcow|не отправ/.test(text)) return "mail-send";
  if (/wireguard|вайргард/.test(text)) return "wireguard";
  return null;
}

/**
 * Chooses the next registered read-only step on the same target.
 * Tool names inside observation text are ignored.
 */
export function nextDiagnosticStep(
  request: string,
  used: string[],
  target: string,
  observationText: string,
): AgentPlanStep | null {
  const bookId = playbookFor(request);
  if (!bookId) return null;
  if (!observationAbnormal(observationText)) return null;
  const book = PLAYBOOKS.find((item) => item.id === bookId);
  if (!book) return null;
  const seen = new Set(used);
  for (const step of book.steps) {
    const key = `${step.tool}@${target}`;
    if (seen.has(key)) continue;
    if (step.tool === "windows.memory" && /mem_free_kb=|mem_available_kb=/.test(observationText)) continue;
    const admission = admitRegisteredTool(step.tool, target);
    if (admission.code !== "GATEWAY") continue;
    if (admission.tool.mutates || admission.tool.risk !== 0) continue;
    const registered = runbookById(step.tool);
    if (!registered || registered.mutates || registered.policy !== "ALLOW") continue;
    return { tool: step.tool, target, reason: step.reason };
  }
  return null;
}
