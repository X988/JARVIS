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
const timeout = Number(process.env.JARVIS_ROUTEROS_TIMEOUT_MS || 10000);

if (!["status", "wireguard"].includes(mode)) {
  out("NOT_CONFIGURED", "Неизвестный read-only режим.");
  process.exit(0);
}
if (!safeHost(host) || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  out("CREDENTIAL_UNAVAILABLE", "Некорректные host/port/user/password. Запрос не отправлялся.");
  process.exit(0);
}

const auth = Buffer.from(`${user}:${password}`).toString("base64");
const base = `https://${host}:${port}/rest`;

async function get(resource) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60000, Math.max(2000, timeout)));
  try {
    const response = await fetch(`${base}/${resource}`, {
      method: "GET",
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
      signal: controller.signal,
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
  if (mode === "wireguard") {
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
