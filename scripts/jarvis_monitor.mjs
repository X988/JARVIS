#!/usr/bin/env node

const provider = process.argv[2] ?? "";

function out(code, detail, events = []) {
  process.stdout.write(JSON.stringify({ code, detail, events }));
}

function endpoint(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.hash) return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    return url;
  } catch {
    return null;
  }
}

function severity(value) {
  const source = String(value ?? "").toLowerCase();
  if (/critical|disaster|high|bad|error|fatal/.test(source)) return "bad";
  if (/warning|warn|medium|average/.test(source)) return "warn";
  return "ok";
}

async function json(url, init = {}) {
  const controller = new AbortController();
  const raw = Number(process.env.JARVIS_MONITOR_TIMEOUT_MS ?? 10000);
  const timeout = Number.isFinite(raw) ? Math.max(1000, Math.min(60000, Math.trunc(raw))) : 10000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error("http");
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function prometheus() {
  const base = endpoint("JARVIS_PROMETHEUS_URL");
  if (!base) return out("NOT_CONFIGURED", "JARVIS_PROMETHEUS_URL invalid");
  const url = new URL(base);
  url.pathname = base.pathname + "/api/v1/query";
  url.searchParams.set("query", "up == 0");
  const body = await json(url);
  const result = Array.isArray(body?.data?.result) ? body.data.result : [];
  const events = result.slice(0, 100).map((row) => ({
    source: "prometheus",
    target: String(row?.metric?.instance ?? row?.metric?.job ?? "unknown"),
    at: new Date().toISOString(),
    severity: "bad",
    evidence: "Prometheus up == 0",
    runbook: null,
    mode: "live",
    title: "Target недоступен по Prometheus",
  }));
  return out("OK", `events=${events.length}`, events);
}

async function alertmanager() {
  const base = endpoint("JARVIS_ALERTMANAGER_URL");
  if (!base) return out("NOT_CONFIGURED", "JARVIS_ALERTMANAGER_URL invalid");
  const url = new URL(base);
  url.pathname = base.pathname + "/api/v2/alerts";
  url.searchParams.set("active", "true");
  url.searchParams.set("silenced", "false");
  url.searchParams.set("inhibited", "false");
  const body = await json(url);
  const rows = Array.isArray(body) ? body : [];
  const events = rows.slice(0, 100).map((row) => ({
    source: "alertmanager",
    target: String(row?.labels?.instance ?? row?.labels?.job ?? row?.labels?.alertname ?? "unknown"),
    at: String(row?.startsAt ?? new Date().toISOString()),
    severity: severity(row?.labels?.severity),
    evidence: String(row?.annotations?.description ?? row?.annotations?.summary ?? "active alert").slice(0, 1000),
    runbook: null,
    mode: "live",
    title: String(row?.labels?.alertname ?? "Alertmanager alert").slice(0, 200),
  }));
  return out("OK", `events=${events.length}`, events);
}

async function zabbix() {
  const base = endpoint("JARVIS_ZABBIX_URL");
  const token = process.env.JARVIS_ZABBIX_TOKEN?.trim();
  if (!base || !token) return out("NOT_CONFIGURED", "Zabbix URL/token missing");
  const url = new URL(base);
  if (!/api_jsonrpc\.php$/i.test(url.pathname)) {
    url.pathname = url.pathname + "/api_jsonrpc.php";
  }
  const body = await json(url, {
    method: "POST",
    headers: { "content-type": "application/json-rpc", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "problem.get",
      params: {
        output: ["eventid", "name", "severity", "clock"],
        recent: true,
        sortfield: ["eventid"],
        sortorder: "DESC",
        limit: 100,
      },
      id: 1,
    }),
  });
  if (body?.error) throw new Error("zabbix");
  const rows = Array.isArray(body?.result) ? body.result : [];
  const events = rows.map((row) => ({
    source: "zabbix",
    target: "zabbix",
    at: new Date(Number(row?.clock ?? 0) * 1000 || Date.now()).toISOString(),
    severity: Number(row?.severity ?? 0) >= 4 ? "bad" : Number(row?.severity ?? 0) >= 2 ? "warn" : "ok",
    evidence: `eventid=${String(row?.eventid ?? "")}`,
    runbook: null,
    mode: "live",
    title: String(row?.name ?? "Zabbix problem").slice(0, 200),
  }));
  return out("OK", `events=${events.length}`, events);
}

try {
  if (provider === "prometheus") await prometheus();
  else if (provider === "alertmanager") await alertmanager();
  else if (provider === "zabbix") await zabbix();
  else out("NOT_CONFIGURED", "unknown provider");
} catch {
  out("CONNECT_FAILED", "monitoring provider request failed");
}
