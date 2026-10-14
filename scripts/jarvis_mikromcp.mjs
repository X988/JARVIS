// Minimal MCP (streamable HTTP) client for MikroMCP. Read-only by construction:
// it only calls a tool that is on JARVIS's allowlist AND that the server
// annotates readOnlyHint=true. The bearer token comes from the environment and
// is never printed. Output: one JSON line {code, detail?, text?, structured?, tools?}.
const url = process.env.JARVIS_MIKROMCP_URL ?? "";
const token = process.env.JARVIS_MIKROMCP_TOKEN ?? "";
const timeout = Math.min(60000, Math.max(1000, Number(process.env.JARVIS_MIKROMCP_TIMEOUT_MS) || 8000));
const mode = process.argv[2] ?? "";
const tool = process.argv[3] ?? "";
const allowed = new Set((process.env.JARVIS_MIKROMCP_ALLOWED ?? "").split(",").filter(Boolean));
const WRITE_LIKE = /^(manage|set|run|write|delete|upload|reboot|apply|rollback|create|export|fetch|bulk_execute|plan)_?|run_command/;

function out(body) {
  process.stdout.write(JSON.stringify(body));
}

let sessionId = null;
let nextId = 1;
async function rpc(method, params, notify = false) {
  const body = { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }), ...(notify ? {} : { id: nextId++ }) };
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  sessionId = response.headers.get("mcp-session-id") ?? sessionId;
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error("auth"), { code: "CREDENTIAL_UNAVAILABLE" });
  if (!response.ok) throw Object.assign(new Error(`http ${response.status}`), { code: "CONNECT_FAILED" });
  const text = await response.text();
  if (notify || !text.trim()) return null;
  const json = (response.headers.get("content-type") ?? "").includes("event-stream")
    ? JSON.parse(text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "null")
    : JSON.parse(text);
  if (json?.error) throw Object.assign(new Error(String(json.error.message ?? "rpc error").slice(0, 200)), { code: "VERIFICATION_FAILED" });
  return json?.result;
}

async function main() {
  if (!/^https?:\/\/[^\s]+\/mcp$/.test(url) || !token) return out({ code: "NOT_CONFIGURED", detail: "JARVIS_MIKROMCP_URL/TOKEN не заданы." });
  if (mode !== "list" && mode !== "call") return out({ code: "NOT_CONFIGURED", detail: "unknown mode" });
  if (mode === "call" && (!allowed.has(tool) || WRITE_LIKE.test(tool))) {
    return out({ code: "POLICY_DENIED", detail: `Инструмент ${tool} не входит в read-only allowlist JARVIS.` });
  }
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "jarvis", version: "1" } });
  await rpc("notifications/initialized", undefined, true);
  const tools = (await rpc("tools/list", {}))?.tools ?? [];
  const readOnly = tools.filter((t) => t?.annotations?.readOnlyHint === true && !WRITE_LIKE.test(t.name)).map((t) => t.name);
  if (mode === "list") return out({ code: "OK", tools: readOnly, total: tools.length });
  if (!readOnly.includes(tool)) return out({ code: "POLICY_DENIED", detail: `Сервер не объявил ${tool} как read-only.` });
  let args = {};
  try {
    args = JSON.parse(process.env.JARVIS_MIKROMCP_ARGS || "{}");
  } catch {
    return out({ code: "NOT_CONFIGURED", detail: "bad args" });
  }
  const result = await rpc("tools/call", { name: tool, arguments: args });
  const text = (result?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text).join("\n");
  if (result?.isError) return out({ code: "VERIFICATION_FAILED", detail: text.slice(0, 300) });
  return out({ code: "OK", text: text.slice(0, 4000), structured: result?.structuredContent ?? null });
}

main().catch((error) => out({ code: error?.code ?? (error?.name === "TimeoutError" ? "EXECUTION_TIMEOUT" : "CONNECT_FAILED"), detail: String(error?.message ?? error).slice(0, 200) }));
