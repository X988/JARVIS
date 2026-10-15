import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_ACTORS, canApprove, parseOperators, resolveActor } from "./actors.ts";
import { createFileAuditStore, createMemoryAuditStore } from "./audit-store.ts";
import { executionModeFromEnv, loadToolConfig, publicConfig } from "./config.ts";
import { ToolEngine } from "./engine.ts";
import { heuristicPlan } from "./heuristic.ts";
import { createPlanner, runToolLoop, type Planner } from "./loop.ts";
import { assertMikrotikCall } from "./mikrotik-client.ts";
import { parseOllamaChat, toolSystemPrompt } from "./ollama.ts";
import { assessSshCommand, matchAllow } from "./policy.ts";
import { redactText } from "./redact.ts";
import { backupName } from "./registry.ts";
import { buildSshArgs } from "./ssh-exec.ts";
import type { Actor, ToolConfig } from "./types.ts";

const admin = DEMO_ACTORS[0] as Actor;
const operator = DEMO_ACTORS[1] as Actor;
const viewer = DEMO_ACTORS[2] as Actor;
const stranger = DEMO_ACTORS[3] as Actor;

function config(mode: "dry-run" | "live" = "dry-run", extra: NodeJS.ProcessEnv = {}): ToolConfig {
  return loadToolConfig({ EXECUTION_MODE: mode, ...extra });
}

function harness(mode: "dry-run" | "live" = "dry-run", extra: NodeJS.ProcessEnv = {}) {
  const calls: string[] = [];
  const mtCalls: string[] = [];
  const audit = createMemoryAuditStore();
  const engine = new ToolEngine({
    config: config(mode, extra),
    audit,
    ssh: async (request) => {
      calls.push(request.command);
      return { exitCode: 0, output: "exit 0\nload average: 0.1" };
    },
    mikrotik: {
      async request(call) {
        mtCalls.push(`${call.method} ${call.path}`);
        return { status: 200, body: "[]" };
      },
    },
    now: () => new Date("2026-10-14T16:03:01.000Z"),
    id: (() => {
      let n = 0;
      return (prefix: string) => {
        n += 1;
        return `${prefix}-${n}`;
      };
    })(),
  });
  return { engine, audit, calls, mtCalls };
}

describe("execution mode", () => {
  it("defaults to dry-run unless the flag is live", () => {
    assert.equal(executionModeFromEnv(undefined), "dry-run");
    assert.equal(executionModeFromEnv(""), "dry-run");
    assert.equal(executionModeFromEnv("off"), "dry-run");
    assert.equal(executionModeFromEnv("LIVE"), "live");
    assert.equal(loadToolConfig({}).mode, "dry-run");
  });
});

describe("ssh policy", () => {
  const read = config().sshAllowRead;
  const change = config().sshAllowChange;

  it("allows read commands and a single service token", () => {
    assert.equal(assessSshCommand("uptime", "read-only", read, change, []).ok, true);
    assert.equal(assessSshCommand("df -h", "read-only", read, change, []).ok, true);
    assert.equal(assessSshCommand("systemctl status nginx.service", "read-only", read, change, []).ok, true);
    assert.equal(matchAllow("systemctl status *", "systemctl status nginx"), true);
  });

  it("rejects shell syntax, the denylist, and commands that are not allowlisted", () => {
    assert.equal(assessSshCommand("uptime; rm -rf /", "read-only", read, change, []).ok, false);
    assert.equal(assessSshCommand("uptime && reboot", "read-only", read, change, []).ok, false);
    assert.equal(assessSshCommand("$(reboot)", "read-only", read, change, []).ok, false);
    assert.equal(assessSshCommand("rm -rf /tmp/x", "read-only", ["rm -rf /tmp/x"], change, []).ok, false);
    assert.equal(assessSshCommand("shutdown -h now", "change", read, ["shutdown -h now"], []).ok, false);
    assert.equal(assessSshCommand("echo hi", "read-only", read, change, []).ok, false);
    assert.equal(assessSshCommand("systemctl restart nginx; id", "change", read, change, []).ok, false);
  });

  it("keeps change commands off the read tool", () => {
    assert.equal(assessSshCommand("systemctl restart nginx", "read-only", read, change, []).ok, false);
    assert.equal(assessSshCommand("systemctl restart nginx", "change", read, change, []).ok, true);
    assert.equal(assessSshCommand("uptime", "change", read, change, []).ok, false);
  });
});

describe("tool engine", () => {
  it("does not execute a read in dry-run and writes an audit row", async () => {
    const { engine, calls, audit } = harness("dry-run");
    const call = await engine.call(admin, { name: "ssh_read", args: { host: "mail01", command: "uptime" } });
    assert.equal(calls.length, 0);
    assert.equal(call.result, "dry_run");
    assert.equal(call.command, "ssh jarvis@mail01 uptime");
    assert.equal(audit.records.length, 1);
    assert.equal(audit.records[0]?.actorId, "admin1");
    assert.equal(audit.records[0]?.tool, "ssh_read");
    assert.equal(audit.records[0]?.result, "dry_run");
    assert.ok(audit.records[0]?.at.startsWith("2026-10-14"));
  });

  it("refuses a live read when no identity file is configured", async () => {
    const { engine, calls } = harness("live");
    const call = await engine.call(operator, { name: "ssh_read", args: { host: "mail01", command: "df -h" } });
    assert.equal(calls.length, 0);
    assert.equal(call.result, "error");
    assert.match(call.detail, /identity file/);
  });

  it("executes when the host key is configured", async () => {
    const { engine, calls } = harness("live", { JARVIS_SSH_MAIL01_HOST: "10.0.0.5", JARVIS_SSH_MAIL01_USER: "jarvis", JARVIS_SSH_MAIL01_KEY: "/run/secrets/jarvis_ed25519" });
    const call = await engine.call(admin, { name: "ssh_read", args: { host: "mail01", command: "uptime" } });
    assert.deepEqual(calls, ["uptime"]);
    assert.equal(call.result, "executed");
    assert.match(call.detail, /load average/);
  });

  it("holds a change for approval and does not run it until an operator approves", async () => {
    const { engine, calls } = harness("live", { JARVIS_SSH_MAIL01_HOST: "10.0.0.5", JARVIS_SSH_MAIL01_USER: "jarvis", JARVIS_SSH_MAIL01_KEY: "/run/secrets/jarvis_ed25519" });
    const pending = await engine.call(admin, { name: "ssh_change", args: { host: "mail01", command: "systemctl restart nginx" } });
    assert.equal(calls.length, 0);
    assert.equal(pending.result, "awaiting_approval");
    assert.match(pending.command, /systemctl restart nginx/);
    const forbidden = await engine.decide(viewer, pending.approvalId ?? "", "approve");
    assert.equal(forbidden.result, "forbidden");
    assert.equal(calls.length, 0);
    const approved = await engine.decide(operator, pending.approvalId ?? "", "approve");
    assert.equal(approved.result, "executed");
    assert.deepEqual(calls, ["systemctl restart nginx"]);
    const again = await engine.decide(admin, pending.approvalId ?? "", "approve");
    assert.equal(again.result, "error");
    assert.deepEqual(calls, ["systemctl restart nginx"]);
  });

  it("does not execute a rejected change or a dry-run approval", async () => {
    const live = harness("live", { JARVIS_SSH_MAIL01_HOST: "10.0.0.5", JARVIS_SSH_MAIL01_USER: "jarvis", JARVIS_SSH_MAIL01_KEY: "/run/secrets/jarvis_ed25519" });
    const pending = await live.engine.call(operator, { name: "ssh_change", args: { host: "mail01", command: "systemctl restart postfix" } });
    const rejected = await live.engine.decide(admin, pending.approvalId ?? "", "reject");
    assert.equal(rejected.result, "rejected");
    assert.equal(live.calls.length, 0);

    const dry = harness("dry-run");
    const held = await dry.engine.call(admin, { name: "ssh_change", args: { host: "mail01", command: "systemctl restart dovecot" } });
    const approved = await dry.engine.decide(admin, held.approvalId ?? "", "approve");
    assert.equal(approved.result, "approved_dry_run");
    assert.equal(dry.calls.length, 0);
    assert.match(approved.command, /systemctl restart dovecot/);
  });

  it("denies unknown hosts, strangers, and denylisted commands without creating an approval", async () => {
    const { engine, calls } = harness("live", { JARVIS_SSH_MAIL01_HOST: "10.0.0.5", JARVIS_SSH_MAIL01_USER: "jarvis", JARVIS_SSH_MAIL01_KEY: "/run/secrets/jarvis_ed25519" });
    const unknown = await engine.call(admin, { name: "ssh_read", args: { host: "dc01", command: "uptime" } });
    assert.equal(unknown.result, "denied");
    assert.match(unknown.detail, /not configured/);
    const blocked = await engine.call(admin, { name: "ssh_read", args: { host: "mail01", command: "rm -rf /" } });
    assert.equal(blocked.result, "denied");
    assert.equal(blocked.approvalId, null);
    const outsider = await engine.call(stranger, { name: "ssh_read", args: { host: "mail01", command: "uptime" } });
    assert.equal(outsider.result, "denied");
    assert.equal(calls.length, 0);
  });

  it("reads MikroTik without approval and holds interface changes", async () => {
    const { engine, mtCalls } = harness("dry-run");
    const read = await engine.call(viewer, { name: "mikrotik_interfaces", args: {} });
    assert.equal(read.result, "dry_run");
    assert.equal(read.command, "GET https://rb5009:443/rest/interface");
    assert.equal(mtCalls.length, 0);
    const change = await engine.call(viewer, { name: "mikrotik_set_interface", args: { name: "ether2", disabled: true } });
    assert.equal(change.result, "awaiting_approval");
    assert.equal(change.command, 'PATCH https://rb5009:443/rest/interface/ether2 {"disabled":true}');
    assert.doesNotMatch(change.command, /password/i);
    const bad = await engine.call(admin, { name: "mikrotik_set_interface", args: { name: "../user", disabled: true } });
    assert.equal(bad.result, "denied");
  });

  it("builds a backup name the client will accept", () => {
    const name = backupName(new Date("2026-10-14T16:03:01.000Z"));
    assert.equal(name, "jarvis-20261014T160301Z");
    assert.doesNotThrow(() => assertMikrotikCall({ method: "POST", path: "/rest/system/backup/save", body: { name } }));
    assert.throws(() => assertMikrotikCall({ method: "POST", path: "/rest/system/script/run", body: { name } }));
  });
});

describe("ssh argv", () => {
  it("passes the remote command as one argument and forces key auth", () => {
    const args = buildSshArgs({
      host: { alias: "mail01", host: "10.0.0.5", user: "jarvis", port: 22, identityFile: "/run/secrets/jarvis_ed25519", configured: true },
      command: "uptime",
      knownHostsPath: "/tmp/known_hosts",
    });
    assert.equal(args.at(-1), "uptime");
    assert.ok(args.includes("BatchMode=yes"));
    assert.ok(args.includes("IdentitiesOnly=yes"));
    assert.equal(args[0], "-i");
  });
});

describe("ollama loop", () => {
  it("parses tool calls and ignores a down endpoint via the heuristic", async () => {
    const plan = parseOllamaChat({
      message: {
        content: "",
        tool_calls: [{ function: { name: "ssh_read", arguments: "{\"host\":\"mail01\",\"command\":\"uptime\"}" } }],
      },
    });
    assert.equal(plan.toolCalls[0]?.name, "ssh_read");
    assert.equal(plan.toolCalls[0]?.args.command, "uptime");

    const loaded = config("dry-run");
    loaded.mikrotik = { ...loaded.mikrotik, password: "super-secret", configured: true };
    assert.doesNotMatch(toolSystemPrompt(loaded), /super-secret/);
    assert.equal(publicConfig(loaded).mikrotik.configured, true);
    assert.equal("password" in publicConfig(loaded).mikrotik, false);
  });

  it("runs a read and stops when a change is waiting", async () => {
    const { engine } = harness("dry-run");
    let rounds = 0;
    const planner: Planner = async () => {
      rounds += 1;
      if (rounds === 1) return { text: "", toolCalls: [{ name: "ssh_read", args: { host: "mail01", command: "uptime" } }] };
      return { text: "host is up", toolCalls: [] };
    };
    const read = await runToolLoop({ text: "uptime", actor: admin, planner, engine, config: engine.config });
    assert.equal(read.handled, true);
    assert.equal(read.calls[0]?.result, "dry_run");
    assert.equal(read.assistant, "host is up");
    assert.equal(rounds, 2);

    rounds = 0;
    const changePlanner: Planner = async () => {
      rounds += 1;
      return { text: "needs approval", toolCalls: [{ name: "mikrotik_export", args: {} }] };
    };
    const change = await runToolLoop({ text: "backup", actor: operator, planner: changePlanner, engine, config: engine.config });
    assert.equal(rounds, 1);
    assert.equal(change.calls[0]?.result, "awaiting_approval");
    assert.match(change.calls[0]?.command ?? "", /POST https:\/\/rb5009:443\/rest\/system\/backup\/save/);
  });

  it("falls back to the heuristic when the planner returns no tools", () => {
    assert.equal(heuristicPlan("Проверь сервер").toolCalls.length, 0);
    assert.equal(heuristicPlan("Покажи интерфейсы MikroTik").toolCalls[0]?.name, "mikrotik_interfaces");
    assert.deepEqual(heuristicPlan("Выключи интерфейс ether2 на MikroTik").toolCalls[0]?.args, { name: "ether2", disabled: true });
    assert.equal(heuristicPlan("ssh mail01 rm -rf /").toolCalls[0]?.name, "ssh_read");
    assert.equal(heuristicPlan("перезапусти nginx на mail01").toolCalls[0]?.args.command, "systemctl restart nginx");
  });

  it("uses the heuristic planner when Ollama is unreachable", async () => {
    const cfg = config();
    const planner = createPlanner(cfg, async () => {
      throw new Error("offline");
    });
    const plan = await planner(
      [
        { role: "system", content: "x" },
        { role: "user", content: "Покажи firewall MikroTik" },
      ],
      [],
    );
    assert.equal(plan.toolCalls[0]?.name, "mikrotik_firewall");
  });
});

describe("audit store", () => {
  it("redacts secrets and round-trips a jsonl file", async () => {
    assert.match(redactText("password=hunter2"), /password=\[redacted\]/);
    assert.match(redactText("Basic YWRtaW46c2VjcmV0"), /Basic \[redacted\]/);
    const dir = await mkdtemp(join(tmpdir(), "jarvis-audit-"));
    const store = createFileAuditStore(join(dir, "audit.jsonl"));
    await store.append({
      id: "aud-1",
      at: "2026-10-14T16:03:01.000Z",
      actorId: "admin1",
      actorName: "admin1",
      role: "admin",
      tool: "ssh_read",
      risk: "read-only",
      command: "uptime",
      host: "mail01",
      mode: "dry-run",
      approvalId: null,
      result: "dry_run",
      detail: "password=hunter2",
    });
    const listed = await store.list();
    assert.equal(listed[0]?.detail, "password=[redacted]");
    const raw = await readFile(join(dir, "audit.jsonl"), "utf8");
    assert.doesNotMatch(raw, /hunter2/);
  });
});

describe("roles", () => {
  it("lets only operator and admin approve", () => {
    assert.equal(canApprove("admin"), true);
    assert.equal(canApprove("operator"), true);
    assert.equal(canApprove("viewer"), false);
    assert.equal(resolveActor("stranger", null)?.allowed, false);
    assert.equal(parseOperators("ops:operator:Ops:7")?.[0]?.role, "operator");
  });
});

describe("examples stay free of secrets", () => {
  it("keeps the example env and secrets file empty of credentials", async () => {
    const env = await readFile(".env.example", "utf8");
    const secrets = await readFile("secrets/jarvis.example.json", "utf8");
    assert.match(env, /EXECUTION_MODE=dry-run/);
    assert.doesNotMatch(env, /BEGIN OPENSSH PRIVATE KEY/);
    assert.doesNotMatch(secrets, /BEGIN OPENSSH PRIVATE KEY/);
    const parsed = JSON.parse(secrets) as { mikrotik?: { password?: string } };
    assert.equal(parsed.mikrotik?.password ?? "", "");
  });
});
