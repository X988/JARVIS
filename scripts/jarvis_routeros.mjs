function out(code, detail) {
  process.stdout.write(JSON.stringify({ code, detail }));
}

function safeHost(value) {
  return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
}

const mode = process.argv[2] ?? "";
const host = process.env.JARVIS_MIKROTIK_HOST ?? "";
const user = process.env.JARVIS_MIKROTIK_USER ?? "";
const password = process.env.JARVIS_MIKROTIK_PASSWORD ?? "";
const port = Number(process.env.JARVIS_MIKROTIK_PORT || 443);
const timeout = Number(process.env.JARVIS_ROUTEROS_TIMEOUT_MS || 15000);

const READ_MODES = ["status", "interfaces", "routes", "dhcp", "wireguard", "firewall-counters", "wan-status", "logs", "resources", "vlan", "reachability"];
const CHANGE_MODES = ["backup", "interface-set"];
if (![...READ_MODES, ...CHANGE_MODES].includes(mode)) {
  out("NOT_CONFIGURED", "Неизвестный режим. Произвольный REST path запрещён.");
  process.exit(0);
}
if (process.env.JARVIS_MIKROTIK_TLS_INSECURE === "1" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  out("POLICY_DENIED", "Проверка TLS не отключается. Запрос не отправлялся.");
  process.exit(0);
}
if (CHANGE_MODES.includes(mode) && process.env.JARVIS_MIKROTIK_CHANGE_ENABLED !== "1") {
  out("ADAPTER_DISABLED", "Изменяющий REST-вызов выключен.");
  process.exit(0);
}
if (!safeHost(host) || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  out("CREDENTIAL_UNAVAILABLE", "Некорректные host/port/user/password. Запрос не отправлялся.");
  process.exit(0);
}

const auth = Buffer.from(`${user}:${password}`).toString("base64");
const base = `https://${host}:${port}/rest`;

const PATHS = {
  status: ["system/resource", "interface", "ip/route"],
  interfaces: ["interface"],
  routes: ["ip/route"],
  dhcp: ["ip/dhcp-server/lease"],
  wireguard: ["interface/wireguard/peers"],
  "firewall-counters": ["ip/firewall/filter"],
  "wan-status": ["interface", "ip/route"],
  logs: ["log"],
  resources: ["system/resource"],
  vlan: ["interface/vlan"],
  reachability: ["interface", "ip/route"],
};

const ALLOWED_PATHS = new Set(Object.values(PATHS).flat());

function assertRelativePath(resource) {
  if (
    typeof resource !== "string" ||
    !ALLOWED_PATHS.has(resource) ||
    resource.startsWith("/") ||
    resource.includes("..") ||
    resource.includes("?") ||
    resource.includes("\\")
  ) {
    throw new Error("path rejected");
  }
}

async function get(resource) {
  assertRelativePath(resource);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60000, Math.max(2000, timeout)));
  try {
    const response = await fetch(`${base}/${resource}`, {
      method: "GET",
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function array(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function handshakeAgeMs(raw, now) {
  const value = String(raw ?? "").trim();
  if (!value || value === "never" || value === "0s") return Number.POSITIVE_INFINITY;
  const stamp = Date.parse(value);
  if (Number.isFinite(stamp)) return Math.max(0, now - stamp);
  let total = 0;
  let matched = false;
  for (const hit of value.matchAll(/(\d+(?:\.\d+)?)(w|d|h|m|s)/g)) {
    matched = true;
    const amount = Number(hit[1]);
    const unit = hit[2];
    const factor = unit === "w" ? 604800000 : unit === "d" ? 86400000 : unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000;
    total += amount * factor;
  }
  return matched ? total : Number.POSITIVE_INFINITY;
}

try {
  if (mode === "logs") {
    const rows = array(await get("log"));
    out("OK", `entries=${rows.length}`);
  } else if (mode === "backup" || mode === "interface-set") {
    out("ADAPTER_DISABLED", "Изменяющий вызов подготовлен политикой, но этот блок не открывает изменяющее соединение.");
  } else if (mode === "wireguard") {
    const peers = array(await get("interface/wireguard/peers"));
    const now = Date.now();
    const staleMs = 5 * 60 * 1000;
    let stale = 0;
    let up = 0;
    for (const peer of peers) {
      const raw = peer["last-handshake"] ?? peer.lastHandshake ?? "";
      const age = handshakeAgeMs(raw, now);
      if (age <= staleMs) up += 1;
      else stale += 1;
    }
    out("OK", `peers=${peers.length}; recent=${up}; stale_or_never=${stale}`);
  } else if (mode === "interfaces") {
    const ifaces = array(await get("interface"));
    const running = ifaces.filter((row) => String(row.running) === "true").length;
    const disabled = ifaces.filter((row) => String(row.disabled) === "true").length;
    out("OK", `interfaces=${ifaces.length}; running=${running}; disabled=${disabled}`);
  } else if (mode === "routes") {
    const routes = array(await get("ip/route"));
    const active = routes.filter((row) => String(row.active) === "true").length;
    const defaults = routes.filter((row) => String(row["dst-address"] ?? row.dstAddress ?? "") === "0.0.0.0/0");
    const activeDefaults = defaults.filter((row) => String(row.active) === "true").length;
    out("OK", `routes=${routes.length}; active=${active}; default_routes=${defaults.length}; active_defaults=${activeDefaults}`);
  } else if (mode === "dhcp") {
    const leases = array(await get("ip/dhcp-server/lease"));
    const bound = leases.filter((row) => String(row.status).toLowerCase() === "bound").length;
    const dynamic = leases.filter((row) => String(row.dynamic) === "true").length;
    out("OK", `leases=${leases.length}; bound=${bound}; dynamic=${dynamic}`);
  } else if (mode === "firewall-counters") {
    const rules = array(await get("ip/firewall/filter"));
    let packets = 0;
    let bytes = 0;
    for (const row of rules) {
      const p = Number(row.packets ?? 0);
      const b = Number(row.bytes ?? 0);
      if (Number.isFinite(p) && p >= 0) packets += p;
      if (Number.isFinite(b) && b >= 0) bytes += b;
    }
    const disabled = rules.filter((row) => String(row.disabled) === "true").length;
    out("OK", `filter_rules=${rules.length}; disabled=${disabled}; packets=${Math.trunc(packets)}; bytes=${Math.trunc(bytes)}`);
  } else if (mode === "resources") {
    const sys = array(await get("system/resource"))[0] ?? {};
    const cpu = sys["cpu-load"] ?? sys.cpuLoad ?? "unknown";
    const free = sys["free-memory"] ?? sys.freeMemory ?? "unknown";
    const total = sys["total-memory"] ?? sys.totalMemory ?? "unknown";
    out("OK", `cpu_load=${cpu}; free_memory=${free}; total_memory=${total}`);
  } else if (mode === "vlan") {
    const vlans = array(await get("interface/vlan"));
    const disabled = vlans.filter((row) => String(row.disabled) === "true").length;
    out("OK", `vlans=${vlans.length}; disabled=${disabled}`);
  } else if (mode === "reachability") {
    const [interfaces, routes] = await Promise.all([get("interface"), get("ip/route")]);
    const ifaces = array(interfaces);
    const routeRows = array(routes);
    const running = ifaces.filter((row) => String(row.running) === "true").length;
    const defaults = routeRows.filter((row) => String(row["dst-address"] ?? row.dstAddress ?? "") === "0.0.0.0/0");
    const activeDefaults = defaults.filter((row) => String(row.active) === "true").length;
    out(activeDefaults > 0 ? "OK" : "VERIFICATION_FAILED", `interfaces_running=${running}/${ifaces.length}; active_defaults=${activeDefaults}; remote_ping=not_sent`);
  } else if (mode === "wan-status") {
    const [interfaces, routes] = await Promise.all([get("interface"), get("ip/route")]);
    const ifaces = array(interfaces);
    const routeRows = array(routes);
    const running = ifaces.filter((row) => String(row.running) === "true").length;
    const defaults = routeRows.filter((row) => String(row["dst-address"] ?? row.dstAddress ?? "") === "0.0.0.0/0");
    const activeDefaults = defaults.filter((row) => String(row.active) === "true").length;
    const code = activeDefaults > 0 ? "OK" : "VERIFICATION_FAILED";
    out(code, `interfaces_running=${running}/${ifaces.length}; default_routes=${defaults.length}; active_defaults=${activeDefaults}`);
  } else {
    const [resource, interfaces, routes] = await Promise.all([
      get("system/resource"),
      get("interface"),
      get("ip/route"),
    ]);
    const sys = array(resource)[0] ?? {};
    const ifaces = array(interfaces);
    const routeRows = array(routes);
    const running = ifaces.filter((row) => String(row.running) === "true").length;
    const activeRoutes = routeRows.filter((row) => String(row.active) === "true").length;
    const cpu = sys["cpu-load"] ?? sys.cpuLoad ?? "unknown";
    const uptime = sys.uptime ?? "unknown";
    out("OK", `uptime=${uptime}; cpu_load=${cpu}; interfaces=${ifaces.length}; running=${running}; routes=${routeRows.length}; active_routes=${activeRoutes}`);
  }
} catch {
  out("CONNECT_FAILED", "RouterOS REST API не ответил или TLS/авторизация не прошли.");
}
