import { admitRegisteredTool } from "../plane/tool-registry.ts";
import { runbookById } from "../server/runbooks.ts";
import { canExecute, canRead, type Session } from "../server/session.ts";

/** Fields a client or model must never be allowed to use as authority. */
export const UNTRUSTED_CLIENT_FIELDS = [
  "operatorId",
  "actorId",
  "role",
  "risk",
  "approved",
  "policy",
  "allowed",
] as const;

const READ_COMMANDS: Record<string, string> = {
  uptime: "server.health",
  hostname: "server.health",
  "uname -a": "server.health",
  "free -m": "server.health",
  "df -h": "disk.check",
  "df -hP": "disk.check",
};

const TOOL_RUNBOOK: Record<string, string> = {
  mikrotik_interfaces: "mikrotik.interfaces",
  mikrotik_firewall: "mikrotik.firewall.counters",
  mikrotik_dhcp_leases: "mikrotik.dhcp",
  mikrotik_logs: "mikrotik.logs",
  mikrotik_resources: "mikrotik.status",
  mikrotik_export: "mikrotik.backup",
  mikrotik_set_interface: "mikrotik.interface.set",
};

export type ToolAdmissionResult = {
  code: string;
  runbook: string;
  target: string;
  risk: number;
  mutates: boolean;
  executed: false;
  detail: string;
  ignored: string[];
};

export function ignoredClientAuthority(body: Record<string, unknown>): string[] {
  return UNTRUSTED_CLIENT_FIELDS.filter((key) => key in body);
}

/**
 * Maps a model tool name onto the existing Runbook Registry.
 * This function never opens SSH or RouterOS. Execution stays in the pipeline gateway.
 * The model's command string is not passed through.
 */
export function admitModelTool(input: {
  session: Session | null;
  tool: string;
  args?: Record<string, unknown>;
  claimed?: Record<string, unknown>;
  now?: number;
}): ToolAdmissionResult {
  const ignored = ignoredClientAuthority(input.claimed ?? {});
  const args = input.args ?? {};
  const hinted =
    typeof args.host === "string"
      ? args.host
      : typeof args.target === "string"
        ? args.target
        : "—";
  const base = {
    executed: false as const,
    ignored,
    runbook: input.tool,
    target: hinted,
    risk: 3,
    mutates: true,
  };
  const now = input.now ?? Date.now();
  if (!input.session || !Number.isFinite(input.session.expiresAt) || input.session.expiresAt <= now) {
    return {
      ...base,
      code: "AUTH_REQUIRED",
      detail: "Нет действительной серверной сессии. Поле operatorId не читается.",
    };
  }
  if (!canRead(input.session.role)) {
    return {
      ...base,
      code: "ACTOR_DENIED",
      detail: "Сессия не даёт прав. Роль из запроса не читается.",
    };
  }
  if (input.tool === "ssh_change" || input.tool === "shell" || input.tool === "ssh_exec") {
    return {
      ...base,
      code: "POLICY_DENIED",
      detail: "Произвольная или изменяющая shell-команда не зарегистрирована.",
    };
  }

  let runbookId = TOOL_RUNBOOK[input.tool] ?? "";
  if (input.tool === "ssh_read") {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    runbookId = READ_COMMANDS[command] ?? "";
    if (!runbookId) {
      return {
        ...base,
        code: "POLICY_DENIED",
        detail: "Команда не входит в фиксированный read-only набор и не будет выполнена.",
      };
    }
  }

  const book = runbookById(runbookId);
  if (!book) {
    return { ...base, code: "RUNBOOK_NOT_FOUND", detail: "Инструмент не сопоставлен с Runbook Registry." };
  }
  const target = hinted === "—" ? (book.targets[0] ?? "—") : hinted;
  if (book.mutates && !canExecute(input.session.role)) {
    return {
      ...base,
      code: "ACTOR_DENIED",
      runbook: book.id,
      target,
      risk: book.risk,
      mutates: true,
      detail: "Viewer не вызывает изменяющие инструменты.",
    };
  }
  const admitted = admitRegisteredTool(book.id, target);
  if (admitted.code === "DENY") {
    return {
      ...base,
      code: "POLICY_DENIED",
      runbook: book.id,
      target,
      risk: book.risk,
      mutates: book.mutates,
      detail: admitted.reason,
    };
  }
  if (book.mutates || book.policy === "DENY_ALWAYS" || book.policy === "APPROVAL_REQUIRED") {
    return {
      ...base,
      code: book.policy === "DENY_ALWAYS" ? "POLICY_DENIED" : "APPROVAL_REQUIRED",
      runbook: book.id,
      target,
      risk: book.risk,
      mutates: book.mutates,
      detail: "Модель не исполняет изменение и не меняет риск. Нужен Approval Engine.",
    };
  }
  return {
    ...base,
    code: "GATEWAY",
    runbook: book.id,
    target,
    risk: book.risk,
    mutates: false,
    detail: "Допуск только через Execution Gateway. Текст команды модели в ssh не подставляется.",
  };
}
