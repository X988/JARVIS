import { WATCH_ALERTS, WATCH_HOSTS, type WatchLevel } from "./watch.ts";
import { admitRegisteredTool } from "./plane/tool-registry.ts";

export type MonitorEvent = {
  source: string;
  target: string;
  at: string;
  severity: WatchLevel;
  evidence: string;
  runbook: string | null;
  mode: "demo" | "live";
  title: string;
};

export interface MonitoringProvider {
  id: string;
  mode: "demo" | "live";
  collect(): MonitorEvent[];
}

export type MonitoringAction = "observe" | "explain" | "suggest" | "self-heal";

export type MonitoringAdmission =
  | { code: "ALLOW"; action: "observe" | "explain" | "suggest" }
  | { code: "GATEWAY"; action: "self-heal"; runbook: string; target: string }
  | { code: "DENY"; action: MonitoringAction; reason: string };

export function admitMonitoringAction(
  action: MonitoringAction,
  options: { policyAllowsRepair?: boolean; runbook?: string; target?: string } = {},
): MonitoringAdmission {
  if (action === "observe" || action === "explain" || action === "suggest") {
    return { code: "ALLOW", action };
  }
  if (!options.policyAllowsRepair) {
    return { code: "DENY", action, reason: "monitoring не запускает self-heal без явного policy" };
  }
  if (!options.runbook || !options.target) {
    return { code: "DENY", action, reason: "self-heal требует зарегистрированный runbook и inventory target" };
  }
  const admitted = admitRegisteredTool(options.runbook, options.target);
  if (admitted.code === "DENY") {
    return { code: "DENY", action, reason: admitted.reason };
  }
  return {
    code: "GATEWAY",
    action,
    runbook: admitted.tool.runbook,
    target: admitted.target,
  };
}

export class DemoMonitoringProvider implements MonitoringProvider {
  readonly id = "demo";
  readonly mode = "demo" as const;
  collect(): MonitorEvent[] {
    const at = new Date(0).toISOString();
    return WATCH_ALERTS.map((item) => ({
      source: "demo",
      target: item.host,
      at,
      severity: item.level,
      evidence: item.broke,
      runbook: item.command,
      mode: "demo",
      title: item.title,
    }));
  }
}

export class PrometheusProvider implements MonitoringProvider {
  readonly id = "prometheus";
  readonly mode = "live" as const;
  status(env: NodeJS.ProcessEnv = process.env): "NOT_CONFIGURED" | "ADAPTER_DISABLED" {
    return env.JARVIS_PROMETHEUS_URL ? "ADAPTER_DISABLED" : "NOT_CONFIGURED";
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

export class ZabbixProvider implements MonitoringProvider {
  readonly id = "zabbix";
  readonly mode = "live" as const;
  status(env: NodeJS.ProcessEnv = process.env): "NOT_CONFIGURED" | "ADAPTER_DISABLED" {
    return env.JARVIS_ZABBIX_URL ? "ADAPTER_DISABLED" : "NOT_CONFIGURED";
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

export class AlertmanagerProvider implements MonitoringProvider {
  readonly id = "alertmanager";
  readonly mode = "live" as const;
  status(env: NodeJS.ProcessEnv = process.env): "NOT_CONFIGURED" | "ADAPTER_DISABLED" {
    return env.JARVIS_ALERTMANAGER_URL ? "ADAPTER_DISABLED" : "NOT_CONFIGURED";
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

export function monitoringStatus(env: NodeJS.ProcessEnv = process.env): string {
  const live = [
    env.JARVIS_PROMETHEUS_URL ? "prometheus:ADAPTER_DISABLED" : "",
    env.JARVIS_ZABBIX_URL ? "zabbix:ADAPTER_DISABLED" : "",
    env.JARVIS_ALERTMANAGER_URL ? "alertmanager:ADAPTER_DISABLED" : "",
  ].filter(Boolean);
  return live.length === 0 ? "MONITORING_NOT_CONFIGURED" : live.join(",");
}

export class UnconfiguredProvider implements MonitoringProvider {
  readonly mode = "live" as const;
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

function configured(env: Record<string, string | undefined>, ...keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]?.trim()));
}

export function providersFromEnv(env: Record<string, string | undefined> = process.env): MonitoringProvider[] {
  const live: MonitoringProvider[] = [];
  if (env.JARVIS_PROMETHEUS_URL) live.push(new PrometheusProvider());
  if (env.JARVIS_ZABBIX_URL) live.push(new ZabbixProvider());
  if (env.JARVIS_ALERTMANAGER_URL) live.push(new AlertmanagerProvider());
  if (configured(env, "JARVIS_WINDOWS_HOST", "JARVIS_WINDOWS_TARGETS_JSON")) live.push(new UnconfiguredProvider("windows"));
  if (configured(env, "JARVIS_SSH_HOST", "JARVIS_SSH_TARGETS_JSON")) live.push(new UnconfiguredProvider("linux"));
  if (env.JARVIS_SQL_HOST) live.push(new UnconfiguredProvider("sql"));
  if (env.JARVIS_MIKROTIK_HOST) live.push(new UnconfiguredProvider("mikrotik"));
  if (env.JARVIS_DOCKER_HOST) live.push(new UnconfiguredProvider("mailcow"));
  return [new DemoMonitoringProvider(), ...live];
}

export function demoHosts() {
  return WATCH_HOSTS.map((host) => ({ ...host, source: "demo" as const }));
}
