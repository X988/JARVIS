import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WATCH_ALERTS, WATCH_HOSTS, type WatchLevel } from "./watch.ts";
import { admitRegisteredTool } from "./plane/tool-registry.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/jarvis_monitor.mjs");

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
export type MonitoringStatus = "NOT_CONFIGURED" | "CONFIGURED_UNPROBED" | "OK" | "CONNECT_FAILED";

export type MonitoringAdmission =
  | { code: "ALLOW"; action: "observe" | "explain" | "suggest" }
  | { code: "GATEWAY"; action: "self-heal"; runbook: string; target: string }
  | { code: "DENY"; action: MonitoringAction; reason: string };

export type MonitorRunner = (
  provider: "prometheus" | "zabbix" | "alertmanager",
  env: NodeJS.ProcessEnv,
) => { code: string; detail: string; events: MonitorEvent[] };

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

function configuredUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function runMonitor(
  provider: "prometheus" | "zabbix" | "alertmanager",
  env: NodeJS.ProcessEnv,
): { code: string; detail: string; events: MonitorEvent[] } {
  const timeoutRaw = Number(env.JARVIS_MONITOR_TIMEOUT_MS ?? 10_000);
  const timeout = Number.isFinite(timeoutRaw) ? Math.max(2_000, Math.min(70_000, Math.trunc(timeoutRaw) + 5_000)) : 15_000;
  const run = spawnSync(process.execPath, [script, provider], {
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...env },
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ETIMEDOUT") return { code: "CONNECT_FAILED", detail: "monitoring timeout", events: [] };
  if (error?.code === "ENOENT" || !run.stdout?.trim()) return { code: "CONNECT_FAILED", detail: "monitor adapter не запустился", events: [] };
  try {
    const body = JSON.parse(run.stdout) as { code?: string; detail?: string; events?: MonitorEvent[] };
    const events = Array.isArray(body.events)
      ? body.events.filter(
          (event) =>
            event &&
            typeof event.source === "string" &&
            typeof event.target === "string" &&
            typeof event.title === "string" &&
            (event.severity === "ok" || event.severity === "warn" || event.severity === "bad"),
        ).slice(0, 100)
      : [];
    return { code: body.code ?? "CONNECT_FAILED", detail: body.detail ?? "нет ответа", events };
  } catch {
    return { code: "CONNECT_FAILED", detail: "monitor response не разобран", events: [] };
  }
}

abstract class LiveMonitoringProvider implements MonitoringProvider {
  abstract readonly id: "prometheus" | "zabbix" | "alertmanager";
  readonly mode = "live" as const;
  protected readonly env: NodeJS.ProcessEnv;
  protected readonly runner: MonitorRunner;

  constructor(env: NodeJS.ProcessEnv = process.env, runner: MonitorRunner = runMonitor) {
    this.env = env;
    this.runner = runner;
  }

  abstract status(): MonitoringStatus;

  collect(): MonitorEvent[] {
    if (this.status() === "NOT_CONFIGURED") return [];
    return this.runner(this.id, this.env).events;
  }

  probe(): { status: MonitoringStatus; detail: string; events: MonitorEvent[] } {
    if (this.status() === "NOT_CONFIGURED") return { status: "NOT_CONFIGURED", detail: "provider не настроен", events: [] };
    const result = this.runner(this.id, this.env);
    return {
      status: result.code === "OK" ? "OK" : "CONNECT_FAILED",
      detail: result.detail,
      events: result.events,
    };
  }
}

export class PrometheusProvider extends LiveMonitoringProvider {
  readonly id = "prometheus" as const;
  status(): MonitoringStatus {
    return configuredUrl(this.env.JARVIS_PROMETHEUS_URL) ? "CONFIGURED_UNPROBED" : "NOT_CONFIGURED";
  }
}

export class ZabbixProvider extends LiveMonitoringProvider {
  readonly id = "zabbix" as const;
  status(): MonitoringStatus {
    return configuredUrl(this.env.JARVIS_ZABBIX_URL) && Boolean(this.env.JARVIS_ZABBIX_TOKEN?.trim())
      ? "CONFIGURED_UNPROBED"
      : "NOT_CONFIGURED";
  }
}

export class AlertmanagerProvider extends LiveMonitoringProvider {
  readonly id = "alertmanager" as const;
  status(): MonitoringStatus {
    return configuredUrl(this.env.JARVIS_ALERTMANAGER_URL) ? "CONFIGURED_UNPROBED" : "NOT_CONFIGURED";
  }
}

export function monitoringStatus(env: NodeJS.ProcessEnv = process.env): string {
  const live = [
    new PrometheusProvider(env),
    new ZabbixProvider(env),
    new AlertmanagerProvider(env),
  ]
    .map((provider) => [provider.id, provider.status()] as const)
    .filter(([, status]) => status !== "NOT_CONFIGURED")
    .map(([id, status]) => `${id}:${status}`);
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

export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): MonitoringProvider[] {
  const live: MonitoringProvider[] = [];
  if (new PrometheusProvider(env).status() !== "NOT_CONFIGURED") live.push(new PrometheusProvider(env));
  if (new ZabbixProvider(env).status() !== "NOT_CONFIGURED") live.push(new ZabbixProvider(env));
  if (new AlertmanagerProvider(env).status() !== "NOT_CONFIGURED") live.push(new AlertmanagerProvider(env));
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
