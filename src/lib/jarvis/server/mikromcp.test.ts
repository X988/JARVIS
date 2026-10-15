import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyAudit } from "../audit-log.ts";
import { MIKROMCP_DEFAULT_TIMEOUT_MS, MIKROMCP_PROCESS_MARGIN_MS, normalizeCode, exposedTools, isAllowedMikroMcpTool, mikroMcpConfigured, runMikroMcp, summarize } from "./mikromcp.ts";
import { ROUTEROS_PROCESS_MARGIN_MS, routerOsTimeoutMs, runRouterOs } from "./routeros.ts";
import { listRunbooks } from "./runbooks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "../../../../scripts/jarvis_mikromcp.mjs");
let server: ChildProcess;
let port = 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-mcp-"));
const callLog = path.join(dir, "calls.log");

before(async () => {
  server = spawn(process.execPath, [path.join(here, "testdata/fake-mikromcp.mjs"), callLog]);
  port = await new Promise<number>((resolve) => server.stdout!.once("data", (d) => resolve(Number(String(d).trim()))));
});
after(() => server.kill());

const env = () => ({ JARVIS_MIKROMCP_URL: `http://127.0.0.1:${port}/mcp`, JARVIS_MIKROMCP_TOKEN: "test-token", JARVIS_STATE_DIR: dir }) as NodeJS.ProcessEnv;
const call = (runbook: string) => ({ runbook, target: "rb5009", mode: "real" }) as never;
const calls = () => (fs.existsSync(callLog) ? fs.readFileSync(callLog, "utf8").trim().split("\n").filter(Boolean) : []);

describe("mikromcp allowlist", () => {
  it("never exposes write tools even if the server marks them read-only", () => {
    assert.equal(isAllowedMikroMcpTool("run_command"), false);
    assert.equal(isAllowedMikroMcpTool("manage_route"), false);
    assert.equal(isAllowedMikroMcpTool("get_system_status"), true);
    assert.deepEqual(
      exposedTools([
        { name: "get_system_status", annotations: { readOnlyHint: true } },
        { name: "manage_route", annotations: { readOnlyHint: true } },
        { name: "run_command", annotations: { readOnlyHint: true } },
        { name: "list_interfaces", annotations: { readOnlyHint: false } },
      ]),
      ["get_system_status"],
    );
  });

  it("only accepts plain HTTP on loopback", () => {
    assert.equal(mikroMcpConfigured({ JARVIS_MIKROMCP_URL: "http://192.168.0.156:8787/mcp", JARVIS_MIKROMCP_TOKEN: "t" }), false);
    assert.equal(mikroMcpConfigured({ JARVIS_MIKROMCP_URL: "http://127.0.0.1:8787/mcp", JARVIS_MIKROMCP_TOKEN: "t" }), true);
    assert.equal(mikroMcpConfigured({ JARVIS_MIKROMCP_URL: "http://127.0.0.1:8787/mcp" }), false);
  });

  it("client script refuses run_command / manage_* before any network call", () => {
    for (const tool of ["run_command", "manage_route"]) {
      const run = spawnSync(process.execPath, [script, "call", tool], { encoding: "utf8", env: { ...env(), JARVIS_MIKROMCP_ALLOWED: "run_command,manage_route" } });
      assert.equal(JSON.parse(run.stdout).code, "POLICY_DENIED");
    }
    assert.deepEqual(calls(), []);
  });
});

describe("mikromcp calls", () => {
  it("answers system status via MikroMCP and writes an audit row", () => {
    const result = runMikroMcp(call("mikrotik.status"), env());
    assert.ok(!("fallback" in result));
    assert.equal(result.code, "OK");
    assert.match(result.detail, /mikromcp:get_system_status: board=CCR1009-7G-1C; routeros=7\.21\.3; uptime=1d; cpu_load=3%; memory_used=50%/);
    const rows = fs.readFileSync(path.join(dir, "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows.at(-1).action, "mikromcp.call:get_system_status");
    assert.equal(verifyAudit(dir).ok, true);
  });

  it("refuses a tool the server does not annotate read-only", () => {
    const result = runMikroMcp(call("mikrotik.interfaces"), env());
    assert.ok(!("fallback" in result) && result.code === "POLICY_DENIED");
    assert.ok(!calls().includes("list_interfaces"));
  });

  it("summarizes DHCP without MAC addresses", () => {
    const result = runMikroMcp(call("mikrotik.dhcp"), env());
    assert.ok(!("fallback" in result));
    assert.equal(result.detail, "mikromcp:list_dhcp_leases: leases=2; bound=1; dynamic=1; static=1");
    assert.doesNotMatch(result.detail, /AA:BB/);
  });

  it("falls back to the REST client when MikroMCP is down or the token is wrong", () => {
    const down = runRouterOs(call("mikrotik.status"), { JARVIS_MIKROMCP_URL: "http://127.0.0.1:1/mcp", JARVIS_MIKROMCP_TOKEN: "x", JARVIS_STATE_DIR: dir, JARVIS_MIKROMCP_TIMEOUT_MS: "1000" } as NodeJS.ProcessEnv);
    assert.equal(down.code, "NOT_CONFIGURED");
    assert.match(down.detail, /MikroMCP недоступен: CONNECT_FAILED.*ответ через REST/);
    const badToken = runMikroMcp(call("mikrotik.status"), { ...env(), JARVIS_MIKROMCP_TOKEN: "wrong" } as NodeJS.ProcessEnv);
    assert.ok("fallback" in badToken && /CREDENTIAL_UNAVAILABLE/.test(badToken.fallback));
  });

  it("logs and summarize helpers stay MAC-free", () => {
    assert.doesNotMatch(summarize("mikrotik.logs", { entries: [{ time: "t", topics: "dhcp", message: "assigned 1.2.3.4 for 11:22:33:44:55:66" }], total: 1 }, ""), /11:22/);
  });
});

describe("router timeouts and failure audit", () => {
  const rows = () => fs.readFileSync(path.join(dir, "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

  it("defaults: MikroMCP 20 s, REST 15 s, and both fit inside every routeros read runbook budget", () => {
    assert.equal(MIKROMCP_DEFAULT_TIMEOUT_MS, 20_000);
    assert.equal(routerOsTimeoutMs(""), 15_000);
    const worst = MIKROMCP_DEFAULT_TIMEOUT_MS + MIKROMCP_PROCESS_MARGIN_MS + routerOsTimeoutMs(undefined) + ROUTEROS_PROCESS_MARGIN_MS;
    for (const book of listRunbooks().filter((b) => b.executor === "routeros" && !b.mutates)) {
      assert.ok(book.timeoutSec * 1000 >= worst, `${book.id} timeoutSec=${book.timeoutSec} < ${worst} ms`);
    }
  });

  it("a hanging MikroMCP call is audited as a timeout row (string code, hash-chained)", () => {
    const before = rows().length;
    const result = runMikroMcp(call("mikrotik.routes"), { ...env(), JARVIS_MIKROMCP_TIMEOUT_MS: "1000" } as NodeJS.ProcessEnv);
    assert.ok("fallback" in result && /EXECUTION_TIMEOUT/.test(result.fallback));
    const row = rows().at(-1);
    assert.equal(rows().length, before + 1);
    assert.equal(row.action, "mikromcp.call:list_routes");
    assert.equal(row.result, "EXECUTION_TIMEOUT");
    assert.match(row.normalized, /status=timeout/);
    assert.match(row.error, /^timeout: /);
    assert.equal(verifyAudit(dir).ok, true);
  });

  it("an unreachable MikroMCP and a failing REST fallback both leave error rows", () => {
    const before = rows().length;
    runRouterOs(call("mikrotik.status"), {
      JARVIS_MIKROMCP_URL: "http://127.0.0.1:1/mcp",
      JARVIS_MIKROMCP_TOKEN: "x",
      JARVIS_MIKROMCP_TIMEOUT_MS: "1000",
      JARVIS_STATE_DIR: dir,
      JARVIS_MIKROTIK_HOST: "127.0.0.1",
      JARVIS_MIKROTIK_PORT: "1",
      JARVIS_MIKROTIK_USER: "u",
      JARVIS_MIKROTIK_PASSWORD: "p",
      JARVIS_ROUTEROS_TIMEOUT_MS: "2000",
    } as NodeJS.ProcessEnv);
    const added = rows().slice(before);
    assert.deepEqual(added.map((r) => [r.action, /status=(\w+)/.exec(r.normalized)?.[1]]), [
      ["mikromcp.call:get_system_status", "error"],
      ["routeros.call:status", "error"],
    ]);
    assert.equal(verifyAudit(dir).ok, true);
  });

  it("numeric or odd client codes never reach the audit as non-strings", () => {
    assert.equal(normalizeCode(23), "MIKROMCP_ERROR");
    assert.equal(normalizeCode("EXECUTION_TIMEOUT"), "EXECUTION_TIMEOUT");
    assert.equal(normalizeCode("x y"), "MIKROMCP_ERROR");
  });
});
