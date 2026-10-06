import { WATCH_ALERTS, WATCH_HOSTS, type WatchLevel } from "./watch.ts";

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
  status(): "NOT_CONFIGURED" | "ADAPTER_DISABLED" {
    return process.env.JARVIS_PROMETHEUS_URL ? "ADAPTER_DISABLED" : "NOT_CONFIGURED";
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

export class ZabbixProvider implements MonitoringProvider {
  readonly id = "zabbix";
  readonly mode = "live" as const;
  status(): "NOT_CONFIGURED" | "ADAPTER_DISABLED" {
    return process.env.JARVIS_ZABBIX_URL ? "ADAPTER_DISABLED" : "NOT_CONFIGURED";
  }
  collect(): MonitorEvent[] {
    return [];
  }
}

export function monitoringStatus(env: NodeJS.ProcessEnv = process.env): string {
  const live = [
    env.JARVIS_PROMETHEUS_URL ? "prometheus:ADAPTER_DISABLED" : "",
    env.JARVIS_ZABBIX_URL ? "zabbix:ADAPTER_DISABLED" : "",
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

const LIVE = [
  ["JARVIS_WINDOWS_HOST", "windows"],
  ["JARVIS_LINUX_HOST", "linux"],
  ["JARVIS_SQL_HOST", "sql"],
  ["JARVIS_MIKROTIK_HOST", "mikrotik"],
  ["JARVIS_MAILCOW_HOST", "mailcow"],
  ["JARVIS_ALERTMANAGER_URL", "alertmanager"],
] as const;

export function providersFromEnv(env: Record<string, string | undefined> = process.env): MonitoringProvider[] {
  const live: MonitoringProvider[] = [];
  if (env.JARVIS_PROMETHEUS_URL) live.push(new PrometheusProvider());
  if (env.JARVIS_ZABBIX_URL) live.push(new ZabbixProvider());
  for (const [key, id] of LIVE) {
    if (env[key]) live.push(new UnconfiguredProvider(id));
  }
  return [new DemoMonitoringProvider(), ...live];
}

export function demoHosts() {
  return WATCH_HOSTS.map((host) => ({ ...host, source: "demo" as const }));
}
