import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { appendAudit, verifyAudit } from "../audit-log.ts";
import { runAgentTurn } from "../plane/agent-runtime.ts";
import { admitModelTool } from "../tools/gateway.ts";
import { createApproval, parameterHash, takeApproval } from "./approvals.ts";
import { handleCommand, handleSession } from "./http.ts";
import { sshArgs, sshKnownHostsRequired } from "./host-probes.ts";
import { processCommand } from "./pipeline.ts";
import { runRouterOs } from "./routeros.ts";
import { allowTestAuth, testSession, type Session } from "./session.ts";

const now = new Date("2026-10-14T12:00:00Z");
const admin: Session = testSession("admin1", now.getTime());
const viewer: Session = testSession("viewer1", now.getTime());
const other: Session = testSession("operator2", now.getTime());
const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "approval-race-worker.ts");

function freshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sec-"));
}

function run(text: string, extra: Partial<Parameters<typeof processCommand>[0]> = {}) {
  return processCommand({
    text,
    requestId: extra.requestId ?? `req-${Math.random().toString(16).slice(2)}`,
    session: extra.session === undefined ? admin : extra.session,
    now,
    stateDir: extra.stateDir ?? freshDir(),
    mode: extra.mode,
    execute: extra.execute,
    forged: extra.forged,
    approval: extra.approval,
    channel: extra.channel,
  });
}

async function authed(actor: string, expired = false): Promise<{ csrf: string; token: string }> {
  process.env.JARVIS_TEST_AUTH = "1";
  delete process.env.NODE_ENV;
  const headers: Record<string, string> = { "x-jarvis-test-actor": actor };
  if (expired) headers["x-jarvis-test-expired"] = "1";
  const opened = await handleSession(new Request("http://127.0.0.1/api/session", { headers }));
  const csrf = opened.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
  const token = decodeURIComponent(csrf.split("=")[1] ?? "");
  return { csrf, token };
}

function post(actor: string, body: unknown, csrf: string, token: string, expired = false): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-jarvis-test-actor": actor,
    cookie: csrf,
    "x-jarvis-csrf": token,
  };
  if (expired) headers["x-jarvis-test-expired"] = "1";
  return new Request("http://127.0.0.1/api/commands", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("authorization failures", () => {
  it("does not honor test actors or demo promotion in production", () => {
    assert.equal(allowTestAuth({ NODE_ENV: "production", JARVIS_TEST_AUTH: "1" }), false);
    assert.equal(allowTestAuth({ JARVIS_TEST_AUTH: "1" }), true);
  });

  it("rejects a command with no session, an expired session, and a forged operatorId", async () => {
    const stateDir = freshDir();
    process.env.JARVIS_STATE_DIR = stateDir;
    const anon = await handleCommand(
      new Request("http://127.0.0.1/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Проверь сервер", operatorId: "root" }),
      }),
    );
    assert.equal(anon.status, 401);

    const { csrf, token } = await authed("admin1", true);
    const expired = await handleCommand(post("admin1", { text: "Проверь сервер", operatorId: "root" }, csrf, token, true));
    assert.equal(expired.status, 401);

    const live = await authed("admin1");
    const spoofed = await handleCommand(
      post(
        "admin1",
        {
          text: "Проверь сервер",
          operatorId: "stranger",
          actorId: "root",
          role: "admin",
          risk: 0,
          approved: true,
          policy: "ALLOW",
          request_id: "spoof-1",
        },
        live.csrf,
        live.token,
      ),
    );
    const body = await spoofed.json();
    assert.equal(body.code, "OK");
    assert.equal(body.trace.actor ?? body.decision?.actor ?? "admin1", "admin1");
    const audit = fs.readFileSync(path.join(stateDir, "audit.jsonl"), "utf8");
    assert.match(audit, /"actor":"admin1"/);
    assert.doesNotMatch(audit, /"actor":"stranger"/);
    assert.doesNotMatch(audit, /"actor":"root"/);
  });

  it("denies a viewer mutation and confirmation of another actor's approval", async () => {
    const stateDir = freshDir();
    process.env.JARVIS_STATE_DIR = stateDir;
    const read = run("Проверь Mailcow", { session: viewer, stateDir, requestId: "viewer-read" });
    assert.equal(read.code, "OK");
    assert.equal(read.executionCalled, false);

    const blocked = run("Сделай резервную копию базы utp", { session: viewer, stateDir, requestId: "viewer-change" });
    assert.equal(blocked.code, "ACTOR_DENIED");
    assert.equal(blocked.executionCalled, false);

    const opened = run("Сделай резервную копию базы utp", { stateDir, requestId: "owner-open" });
    assert.equal(opened.code, "APPROVAL_REQUIRED");
    assert.ok(opened.approval);
    const stolen = run("Сделай резервную копию базы utp", {
      session: other,
      stateDir,
      requestId: "stolen-confirm",
      mode: "real",
      execute: () => {
        throw new Error("executor must not run");
      },
      approval: { id: opened.approval!.id, confirmation: opened.approval!.phrase },
    });
    assert.equal(stolen.code, "ACTOR_DENIED");
    assert.equal(stolen.executionCalled, false);

    const { csrf, token } = await authed("viewer1");
    const httpDeny = await handleCommand(
      post(
        "viewer1",
        { text: "Сделай резервную копию базы utp", role: "admin", operatorId: "admin1", approved: true, request_id: "viewer-http" },
        csrf,
        token,
      ),
    );
    assert.equal(httpDeny.status, 403);
    assert.equal((await httpDeny.json()).code, "ACTOR_DENIED");
  });
});

describe("approval durability", () => {
  it("rejects a finished approval, a parameter change, and an executor failure", () => {
    const stateDir = freshDir();
    let calls = 0;
    const opened = run("Сделай резервную копию базы utp", { stateDir, requestId: "once-open", mode: "real" });
    assert.ok(opened.approval);
    const first = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "once-a",
      mode: "real",
      execute: () => {
        calls += 1;
        return { called: true, code: "OK", detail: "verified" };
      },
      approval: { id: opened.approval!.id, confirmation: opened.approval!.phrase },
    });
    const replay = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "once-b",
      mode: "real",
      execute: () => {
        calls += 1;
        return { called: true, code: "OK", detail: "verified" };
      },
      approval: { id: opened.approval!.id, confirmation: opened.approval!.phrase },
    });
    assert.equal(first.code, "OK");
    assert.equal(replay.code, "APPROVAL_CLOSED");
    assert.equal(calls, 1);

    const failedOpen = run("Сделай резервную копию базы utp", { stateDir, requestId: "fail-open" });
    assert.ok(failedOpen.approval);
    const failed = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "fail-run",
      mode: "real",
      execute: () => {
        throw new Error("password=hunter2 socket down");
      },
      approval: { id: failedOpen.approval!.id, confirmation: failedOpen.approval!.phrase },
    });
    assert.equal(failed.code, "EXECUTION_FAILED");
    assert.equal(failed.executionCalled, false);
    assert.equal(failed.verdict, "deny");
    const audit = fs.readFileSync(path.join(stateDir, "audit.jsonl"), "utf8");
    assert.doesNotMatch(audit, /hunter2/);
  });

  it("rejects an approval and keeps a pending one across a new process", async () => {
    const stateDir = freshDir();
    const opened = run("Сделай резервную копию базы utp", { stateDir, requestId: "restart-open", now });
    assert.ok(opened.approval);
    const rejected = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "restart-reject",
      now,
      approval: { id: opened.approval!.id, confirmation: "REJECT", decision: "reject" },
    });
    assert.equal(rejected.code, "APPROVAL_REJECTED");
    assert.equal(rejected.executionCalled, false);

    const again = run("Сделай резервную копию базы utp", { stateDir, requestId: "restart-open-2", now });
    assert.ok(again.approval);
    const child = await new Promise<{ code: string; called: boolean }>((resolve, reject) => {
      const subprocess = spawn(
        process.execPath,
        ["--experimental-strip-types", worker, stateDir, again.approval!.id, again.approval!.phrase, "child-confirm", now.toISOString()],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      let err = "";
      subprocess.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      subprocess.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      subprocess.on("exit", (code) => {
        if (code !== 0) reject(new Error(err || out || `exit ${code}`));
        else resolve(JSON.parse(out) as { code: string; called: boolean });
      });
    });
    assert.equal(child.code, "OK");
    assert.equal(child.called, false);
    const rows = JSON.parse(fs.readFileSync(path.join(stateDir, "approvals.json"), "utf8")) as Array<{ id: string; status: string }>;
    assert.equal(rows.find((row) => row.id === again.approval!.id)?.status, "confirmed");
  });

  it("lets only one of two concurrent confirmations execute", async () => {
    const stateDir = freshDir();
    const opened = run("Сделай резервную копию базы utp", { stateDir, requestId: "race-open", now });
    assert.ok(opened.approval);
    const results = await Promise.all(
      ["race-a", "race-b"].map(
        (requestId) =>
          new Promise<{ code: string }>((resolve, reject) => {
            const subprocess = spawn(
              process.execPath,
              [
                "--experimental-strip-types",
                worker,
                stateDir,
                opened.approval!.id,
                opened.approval!.phrase,
                requestId,
                now.toISOString(),
              ],
              { stdio: ["ignore", "pipe", "pipe"] },
            );
            let out = "";
            let err = "";
            subprocess.stdout.on("data", (chunk: Buffer) => {
              out += chunk.toString();
            });
            subprocess.stderr.on("data", (chunk: Buffer) => {
              err += chunk.toString();
            });
            subprocess.on("exit", (code) => {
              if (code !== 0) reject(new Error(err || out || `exit ${code}`));
              else resolve(JSON.parse(out) as { code: string });
            });
          }),
      ),
    );
    const codes = results.map((item) => item.code).sort();
    assert.deepEqual(codes, ["APPROVAL_CLOSED", "OK"]);
  });

  it("requires the second phrase for a double approval and then closes it", () => {
    const stateDir = freshDir();
    const hash = parameterHash({
      runbook: "sql.backup",
      target: "utp",
      normalized: "backup",
      constraint: "нет",
      normalizedParameters: {},
    });
    const row = createApproval(stateDir, {
      id: "APPROVAL-20261014-ABCD",
      actorId: "admin1",
      runbook: "sql.backup",
      target: "utp",
      normalized: "backup",
      normalizedParameters: {},
      constraint: "нет",
      parameterHash: hash,
      risk: 2,
      createdAt: now.getTime(),
      expiresAt: now.getTime() + 60_000,
      required: 2,
    });
    const first = takeApproval(stateDir, {
      id: row.id,
      actorId: "admin1",
      now: now.getTime(),
      decision: "confirm",
      phrase: `CONFIRM ${row.id}`,
      expectedHash: hash,
      risk: 2,
      policyDeny: false,
    });
    assert.equal(first.action, "advance");
    const early = takeApproval(stateDir, {
      id: row.id,
      actorId: "admin1",
      now: now.getTime(),
      decision: "confirm",
      phrase: `CONFIRM ${row.id}`,
      expectedHash: hash,
      risk: 2,
      policyDeny: false,
    });
    assert.equal(early.action, "deny");
    const final = takeApproval(stateDir, {
      id: row.id,
      actorId: "admin1",
      now: now.getTime(),
      decision: "confirm",
      phrase: `CONFIRM FINAL ${row.id}`,
      expectedHash: hash,
      risk: 2,
      policyDeny: false,
    });
    assert.equal(final.action, "ready");
    const replay = takeApproval(stateDir, {
      id: row.id,
      actorId: "admin1",
      now: now.getTime(),
      decision: "confirm",
      phrase: `CONFIRM FINAL ${row.id}`,
      expectedHash: hash,
      risk: 2,
      policyDeny: false,
    });
    assert.equal(replay.action, "deny");
    if (replay.action === "deny") assert.equal(replay.code, "APPROVAL_CLOSED");
  });
});

describe("gateway and adapter refusal", () => {
  it("ignores model risk and refuses arbitrary shell or policy bypass", () => {
    const read = admitModelTool({
      session: admin,
      tool: "ssh_read",
      args: { host: "mail01", command: "df -h" },
      claimed: { operatorId: "root", role: "admin", risk: 0, approved: true, policy: "ALLOW" },
      now: now.getTime(),
    });
    assert.equal(read.code, "GATEWAY");
    assert.equal(read.executed, false);
    assert.equal(read.runbook, "disk.check");
    assert.deepEqual(read.ignored.sort(), ["approved", "operatorId", "policy", "risk", "role"]);

    const shell = admitModelTool({
      session: admin,
      tool: "ssh_read",
      args: { host: "mail01", command: "rm -rf /" },
      claimed: { risk: 0, approved: true },
      now: now.getTime(),
    });
    assert.equal(shell.code, "POLICY_DENIED");
    assert.equal(shell.executed, false);

    const change = admitModelTool({
      session: viewer,
      tool: "ssh_change",
      args: { host: "mail01", command: "systemctl restart nginx" },
      claimed: { role: "admin", risk: 0 },
      now: now.getTime(),
    });
    assert.equal(change.code, "POLICY_DENIED");
    assert.equal(change.risk, 3);

    const backup = admitModelTool({
      session: admin,
      tool: "mikrotik_export",
      claimed: { risk: 0, approved: true, policy: "ALLOW" },
      now: now.getTime(),
    });
    assert.equal(backup.executed, false);
    assert.equal(backup.risk, 3);
    assert.notEqual(backup.code, "OK");
  });

  it("does not open ssh without a known_hosts file when real mode is on", () => {
    const marker = path.join(freshDir(), "ssh-was-started");
    const env = {
      EXECUTION_MODE: "real",
      JARVIS_SSH_TARGETS_JSON: JSON.stringify({ mail01: "mail01.example" }),
      JARVIS_SSH_USER: "jarvis-read",
      JARVIS_SSH_BIN: marker,
    };
    assert.equal(sshKnownHostsRequired(env), true);
    const args = sshArgs({ runbook: "server.health", target: "mail01", mode: "real" }, env);
    assert.equal(args, null);
    assert.equal(fs.existsSync(marker), false);
    const strict = sshArgs(
      { runbook: "server.health", target: "mail01", mode: "real" },
      { ...env, JARVIS_SSH_KNOWN_HOSTS_FILE: "/etc/ssh/ssh_known_hosts", JARVIS_SSH_KEY_FILE: "/run/secrets/jarvis" },
    );
    assert.ok(strict);
    assert.equal(strict?.includes("accept-new"), false);
    assert.match(strict?.join(" ") ?? "", /StrictHostKeyChecking=yes/);
    assert.match(strict?.join(" ") ?? "", /UpdateHostKeys=no/);
  });

  it("refuses MikroTik when TLS verification is disabled and does not call change APIs", () => {
    const insecure = runRouterOs(
      { runbook: "mikrotik.status", target: "rb5009", mode: "real" },
      {
        JARVIS_MIKROTIK_HOST: "router.example",
        JARVIS_MIKROTIK_USER: "jarvis-read",
        JARVIS_MIKROTIK_PASSWORD: "secret",
        JARVIS_MIKROTIK_TLS_INSECURE: "1",
      },
    );
    assert.equal(insecure.code, "POLICY_DENIED");
    assert.equal(insecure.called, false);

    const change = runRouterOs(
      { runbook: "mikrotik.interface.set", target: "rb5009", mode: "real", parameters: { name: "ether2", disabled: "true" } },
      {
        JARVIS_MIKROTIK_HOST: "router.example",
        JARVIS_MIKROTIK_USER: "jarvis-read",
        JARVIS_MIKROTIK_PASSWORD: "secret",
        JARVIS_MIKROTIK_CHANGE_ENABLED: "1",
      },
    );
    assert.notEqual(change.code, "OK");
    assert.equal(change.called, false);
  });

  it("does not execute tools when the planner fails", async () => {
    let calls = 0;
    const result = await runAgentTurn("Проверь сервер", {
      session: admin,
      stateDir: freshDir(),
      env: { JARVIS_AI_AGENT_ENABLED: "1" },
      planner: async () => ({ ok: false, code: "LLM_UNAVAILABLE", detail: "upstream down" }),
      toolRunner: () => {
        calls += 1;
        throw new Error("tool runner must not be called");
      },
    });
    assert.equal(result.code, "LLM_UNAVAILABLE");
    assert.equal(calls, 0);
  });
});

describe("audit integrity", () => {
  it("redacts secrets and detects a changed row", () => {
    const dir = freshDir();
    appendAudit(
      {
        at: now.toISOString(),
        executionId: "exec-audit-1",
        actor: "admin1",
        action: "password=hunter2",
        verdict: "deny",
        channel: "gateway",
        tool: "ssh",
        error: "Bearer sk-abcdefghijklmnopqrstuvwxyz",
      },
      dir,
    );
    const file = path.join(dir, "audit.jsonl");
    const raw = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(raw, /hunter2/);
    assert.doesNotMatch(raw, /sk-abcdefghijklmnopqrstuvwxyz/);
    assert.equal(verifyAudit(dir).ok, true);
    const rows = raw.trim().split("\n");
    const parsed = JSON.parse(rows[0] ?? "{}") as { action?: string };
    parsed.action = "tampered";
    fs.writeFileSync(file, `${JSON.stringify(parsed)}\n`);
    assert.equal(verifyAudit(dir).ok, false);
  });

  it("refuses the command API when the audit chain is broken and does not extend it", async () => {
    const stateDir = freshDir();
    appendAudit(
      {
        at: now.toISOString(),
        executionId: "exec-before-tamper",
        actor: "admin1",
        action: "read",
        verdict: "allow",
        channel: "web",
      },
      stateDir,
    );
    const file = path.join(stateDir, "audit.jsonl");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { action?: string };
    parsed.action = "tampered";
    fs.writeFileSync(file, `${JSON.stringify(parsed)}\n`);
    let called = false;
    const result = run("Проверь Mailcow", {
      stateDir,
      requestId: "tamper-exec",
      execute: () => {
        called = true;
        return { called: true, code: "OK", detail: "must not run" };
      },
    });
    assert.equal(result.code, "AUDIT_INTEGRITY");
    assert.equal(result.executionCalled, false);
    assert.equal(called, false);
    assert.equal(fs.readFileSync(file, "utf8").trim().split("\n").length, 1);
    const alert = JSON.parse(fs.readFileSync(path.join(stateDir, "audit-integrity-alert.json"), "utf8")) as {
      execution?: string;
      requestId?: string;
    };
    assert.equal(alert.execution, "refused");
    assert.equal(alert.requestId, "tamper-exec");
    assert.throws(() => appendAudit(
      { at: now.toISOString(), executionId: "exec-after", actor: "admin1", action: "again", verdict: "deny" },
      stateDir,
    ), /audit integrity/);

    process.env.JARVIS_STATE_DIR = stateDir;
    const { csrf, token } = await authed("admin1");
    const httpDeny = await handleCommand(
      post("admin1", { text: "Проверь сервер", request_id: "tamper-http" }, csrf, token),
    );
    assert.equal(httpDeny.status, 503);
    assert.equal((await httpDeny.json()).code, "AUDIT_INTEGRITY");
    assert.equal(fs.readFileSync(file, "utf8").trim().split("\n").length, 1);
  });

  it("fails closed when approval state is corrupt", () => {
    const stateDir = freshDir();
    fs.writeFileSync(path.join(stateDir, "approvals.json"), "{not-json");
    assert.throws(() => run("Сделай резервную копию базы utp", { stateDir, requestId: "corrupt" }), /approval state/);
  });
});
