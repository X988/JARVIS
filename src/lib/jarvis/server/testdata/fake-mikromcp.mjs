// @ts-nocheck
// Fake MikroMCP server for tests. Offers read tools, a write tool falsely
// annotated read-only, and run_command. Records every tools/call name.
import http from "node:http";
import fs from "node:fs";
const log = process.argv[2];
const tools = [
  { name: "get_system_status", annotations: { readOnlyHint: true } },
  { name: "list_dhcp_leases", annotations: { readOnlyHint: true } },
  { name: "list_routes", annotations: { readOnlyHint: true } },
  { name: "list_interfaces", annotations: { readOnlyHint: false } },
  { name: "manage_route", annotations: { readOnlyHint: true } },
  { name: "run_command", annotations: { readOnlyHint: true } },
];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.headers.authorization !== "Bearer test-token") { res.writeHead(401); return res.end(); }
    const msg = JSON.parse(raw);
    if (!("id" in msg)) { res.writeHead(202); return res.end(); }
    let result = {};
    if (msg.method === "initialize") result = { protocolVersion: "2025-03-26", serverInfo: { name: "fake" }, capabilities: {} };
    if (msg.method === "tools/list") result = { tools };
    if (msg.method === "tools/call" && msg.params.name === "list_routes") {
      return; // never answers: simulates a router that hangs
    }
    if (msg.method === "tools/call") {
      fs.appendFileSync(log, msg.params.name + "\n");
      if (msg.params.name === "get_system_status") result = { content: [{ type: "text", text: "ok" }], structuredContent: { sections: { resource: { "board-name": "CCR1009-7G-1C", version: "7.21.3", uptime: "1d", "cpu-load": 3, "free-memory": 536870912, "total-memory": 1073741824 } } } };
      if (msg.params.name === "list_dhcp_leases") {
        const offset = msg.params.arguments.offset ?? 0;
        const leases = offset === 0 ? [{ status: "bound", dynamic: true, "mac-address": "AA:BB:CC:DD:EE:FF" }] : [{ status: "waiting", dynamic: false }];
        result = { content: [{ type: "text", text: "x" }], structuredContent: { leases, total: 2, offset, limit: 1, hasMore: offset === 0 } };
      }
    }
    res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "s1" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
  });
});
server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\n"));
