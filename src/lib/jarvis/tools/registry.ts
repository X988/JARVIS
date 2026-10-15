import { assessSshCommand, safeInterfaceName } from "./policy.ts";
import type { PlannedCommand, Risk, ToolCall, ToolConfig, ToolSchema } from "./types.ts";

type ToolSpec = {
  name: string;
  risk: Risk;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
  required: string[];
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "ssh_read",
    risk: "read-only",
    description: "Run one allowlisted read-only command on a configured SSH host. Key auth only.",
    parameters: {
      host: { type: "string", description: "Host alias from inventory, such as mail01." },
      command: { type: "string", description: "Exact allowlisted command, such as uptime or df -h." },
    },
    required: ["host", "command"],
  },
  {
    name: "ssh_change",
    risk: "change",
    description: "Run one allowlisted change command. The runtime holds it until a human approves.",
    parameters: {
      host: { type: "string", description: "Host alias from inventory." },
      command: { type: "string", description: "Exact allowlisted change, such as systemctl restart nginx." },
    },
    required: ["host", "command"],
  },
  {
    name: "mikrotik_interfaces",
    risk: "read-only",
    description: "Read RouterOS interfaces.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_firewall",
    risk: "read-only",
    description: "Read RouterOS firewall filter rules.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_dhcp_leases",
    risk: "read-only",
    description: "Read RouterOS DHCP leases.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_logs",
    risk: "read-only",
    description: "Read RouterOS logs.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_resources",
    risk: "read-only",
    description: "Read RouterOS system resources.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_export",
    risk: "change",
    description: "Save a RouterOS backup. Held for human approval.",
    parameters: {},
    required: [],
  },
  {
    name: "mikrotik_set_interface",
    risk: "change",
    description: "Enable or disable one named interface. Held for human approval.",
    parameters: {
      name: { type: "string", description: "Interface name, such as ether2." },
      disabled: { type: "boolean", description: "True disables the interface." },
    },
    required: ["name", "disabled"],
  },
];

const SPEC_BY_NAME = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));

export function toolSchemas(): ToolSchema[] {
  return TOOL_SPECS.map((spec) => ({
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: "object",
        properties: spec.parameters,
        required: spec.required,
      },
    },
  }));
}

export function riskOf(name: string): Risk | null {
  return SPEC_BY_NAME.get(name)?.risk ?? null;
}

function argString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value.trim() : null;
}

function formatSsh(user: string, host: string, port: number, command: string): string {
  const portArg = port === 22 ? "" : ` -p ${port}`;
  return `ssh${portArg} ${user}@${host} ${command}`;
}

function formatRest(host: string, port: number, method: string, path: string, body?: Record<string, unknown>): string {
  const payload = body ? ` ${JSON.stringify(body)}` : "";
  return `${method} https://${host}:${port}${path}${payload}`;
}

const READ_PATHS: Record<string, string> = {
  mikrotik_interfaces: "/rest/interface",
  mikrotik_firewall: "/rest/ip/firewall/filter",
  mikrotik_dhcp_leases: "/rest/ip/dhcp-server/lease",
  mikrotik_logs: "/rest/log",
  mikrotik_resources: "/rest/system/resource",
};

export function backupName(now: Date): string {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `jarvis-${iso}`;
}

export type PrepareResult =
  | { ok: true; planned: PlannedCommand }
  | { ok: false; risk: Risk; command: string; error: string };

export function prepareToolCall(call: ToolCall, config: ToolConfig, now: Date): PrepareResult {
  const spec = SPEC_BY_NAME.get(call.name);
  if (!spec) {
    return { ok: false, risk: "read-only", command: call.name, error: "unknown tool" };
  }
  if (call.name === "ssh_read" || call.name === "ssh_change") {
    const alias = argString(call.args, "host") ?? "";
    const command = argString(call.args, "command") ?? "";
    const host = config.sshHosts.find((item) => item.alias === alias);
    if (!host) {
      return { ok: false, risk: spec.risk, command: command || call.name, error: "host is not configured" };
    }
    const assessed = assessSshCommand(command, spec.risk, config.sshAllowRead, config.sshAllowChange, config.sshDeny);
    const shown = formatSsh(host.user, host.host, host.port, command || "(empty)");
    if (!assessed.ok) {
      return { ok: false, risk: spec.risk, command: shown, error: assessed.reason };
    }
    return {
      ok: true,
      planned: {
        tool: call.name,
        risk: spec.risk,
        host: host.alias,
        command: formatSsh(host.user, host.host, host.port, command),
        action: { transport: "ssh", host, command },
      },
    };
  }
  const mt = config.mikrotik;
  if (call.name === "mikrotik_export") {
    const body = { name: backupName(now) };
    return {
      ok: true,
      planned: {
        tool: call.name,
        risk: "change",
        host: mt.alias,
        command: formatRest(mt.host, mt.port, "POST", "/rest/system/backup/save", body),
        action: { transport: "mikrotik", method: "POST", path: "/rest/system/backup/save", body },
      },
    };
  }
  if (call.name === "mikrotik_set_interface") {
    const name = argString(call.args, "name") ?? "";
    const disabled = call.args.disabled;
    if (!safeInterfaceName(name) || typeof disabled !== "boolean") {
      return {
        ok: false,
        risk: "change",
        command: `PATCH https://${mt.host}:${mt.port}/rest/interface/${name || "?"}`,
        error: "interface name or disabled flag is invalid",
      };
    }
    const body = { disabled };
    const path = `/rest/interface/${name}`;
    return {
      ok: true,
      planned: {
        tool: call.name,
        risk: "change",
        host: mt.alias,
        command: formatRest(mt.host, mt.port, "PATCH", path, body),
        action: { transport: "mikrotik", method: "PATCH", path, body },
      },
    };
  }
  const path = READ_PATHS[call.name];
  if (!path) {
    return { ok: false, risk: spec.risk, command: call.name, error: "unknown tool" };
  }
  return {
    ok: true,
    planned: {
      tool: call.name,
      risk: "read-only",
      host: mt.alias,
      command: formatRest(mt.host, mt.port, "GET", path),
      action: { transport: "mikrotik", method: "GET", path },
    },
  };
}
