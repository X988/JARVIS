import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { handleCommand, handleSession } from "./http.ts";
import { processCommand, type ExecCall } from "./pipeline.ts";
import type { Session } from "./session.ts";

const now = new Date("2026-10-07T08:00:00Z");
const admin: Session = { id: "sess-admin", accountId: "admin1", role: "operator", expiresAt: now.getTime() + 60_000 };
const stranger: Session = { id: "sess-stranger", accountId: "stranger", role: "none", expiresAt: now.getTime() + 60_000 };

function freshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pipe-"));
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
  });
}

describe("server pipeline", () => {
  it("denies an unknown actor", () => {
    const result = run("Проверь сервер", { session: null });
    assert.equal(result.code, "AUTH_REQUIRED");
    assert.equal(result.executionCalled, false);
  });

  it("denies a stranger", () => {
    const result = run("Проверь сервер", { session: stranger });
    assert.equal(result.code, "ACTOR_DENIED");
  });

  it("denies an unknown target", () => {
    const result = run("Проверь сервер zz99");
    assert.equal(result.code, "TARGET_NOT_FOUND");
  });

  it("denies an unknown runbook", () => {
    const result = run("нарисуй кота на стене");
    assert.equal(result.code, "RUNBOOK_NOT_FOUND");
  });

  it("keeps server risk when the client says zero", () => {
    const result = run("Удали базу utp", { forged: { risk: 0, approved: true } });
    assert.equal(result.code, "POLICY_DENIED");
    assert.equal(result.trace.risk, 3);
    assert.equal(result.trace.policy, "DENY_ALWAYS");
  });

  it("denies push to main", () => {
    const result = run("Запушь исправление в main");
    assert.equal(result.code, "POLICY_DENIED");
    assert.equal(result.trace.runbook, "git.push");
  });

  it("does not call the executor in dry-run", () => {
    let calls = 0;
    const result = run("Проверь сервер", {
      mode: "dry-run",
      execute: () => {
        calls += 1;
        return { called: true, code: "OK", detail: "no" };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.code, "OK");
    assert.equal(result.trace.mode, "dry-run");
    assert.equal(result.trace.runbook, "server.health");
    assert.equal(result.executionCalled, false);
  });

  it("does not call the executor when real mode is off", () => {
    let calls = 0;
    run("Проверь Mailcow", {
      mode: "dry-run",
      execute: () => {
        calls += 1;
        return { called: true, code: "OK", detail: "no" };
      },
    });
    assert.equal(calls, 0);
  });

  it("runs a mutating command once for one request id", () => {
    const stateDir = freshDir();
    let calls = 0;
    const execute = (_call: ExecCall) => {
      calls += 1;
      return { called: true, code: "NOT_CONFIGURED", detail: "нет" };
    };
    const first = run("Сделай резервную копию базы utp", { stateDir, requestId: "same", mode: "real", execute });
    assert.equal(first.code, "APPROVAL_REQUIRED");
    const second = run("Сделай резервную копию базы utp", { stateDir, requestId: "same", mode: "real", execute });
    assert.equal(second.duplicate, true);
    assert.equal(calls, 0);
  });

  it("expires an approval and rejects a parameter change", () => {
    const stateDir = freshDir();
    const opened = run("Сделай резервную копию базы utp", { stateDir, now });
    assert.ok(opened.approval);
    const expired = processCommand({
      text: opened.approval?.phrase ?? "",
      requestId: "confirm-late",
      session: admin,
      stateDir,
      now: new Date(now.getTime() + 10 * 60 * 1000),
      mode: "dry-run",
    });
    assert.equal(expired.code, "APPROVAL_EXPIRED");
    const again = run("Сделай резервную копию базы utp", { stateDir, now, requestId: "backup-2" });
    const mismatch = processCommand({
      text: again.approval?.phrase ?? "",
      requestId: "confirm-bad",
      session: admin,
      stateDir,
      now,
      mode: "real",
      execute: () => {
        throw new Error("executor");
      },
      forged: { parameters: { runbook: "sql.backup", target: "sql01", normalized: "database_backup" } },
    });
    assert.equal(mismatch.code, "APPROVAL_MISMATCH");
  });

  it("drops a modifying runbook under NO_CHANGE", () => {
    const result = run("Сделай резервную копию базы utp, ничего не меняй");
    assert.equal(result.code, "POLICY_DENIED");
    assert.equal(result.trace.constraint, "NO_CHANGE");
    assert.equal(result.executionCalled, false);
  });

  it("ignores a short yes", () => {
    assert.equal(run("да").code, "POLICY_DENIED");
  });
});

describe("command http", () => {
  it("returns AUTH_REQUIRED without a session and OK through the server", async () => {
    process.env.JARVIS_STATE_DIR = freshDir();
    process.env.JARVIS_ALLOW_DEV_LOGIN = "1";
    const anon = await handleCommand(new Request("http://127.0.0.1/api/commands", { method: "POST", body: JSON.stringify({ text: "Проверь сервер" }) }));
    assert.equal((await anon.json()).code, "AUTH_REQUIRED");
    const opened = await handleSession(new Request("http://127.0.0.1/api/session"));
    const csrf = opened.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
    const token = decodeURIComponent(csrf.split("=")[1] ?? "");
    const login = await handleSession(
      new Request("http://127.0.0.1/api/session", {
        method: "POST",
        headers: { cookie: csrf, "x-jarvis-csrf": token, "content-type": "application/json" },
        body: JSON.stringify({ accountId: "admin1" }),
      }),
    );
    assert.equal(login.status, 200);
    const session = login.headers.getSetCookie().find((line) => line.startsWith("jarvis_session="))?.split(";")[0] ?? "";
    const command = await handleCommand(
      new Request("http://127.0.0.1/api/commands", {
        method: "POST",
        headers: { cookie: `${csrf}; ${session}`, "x-jarvis-csrf": token, "content-type": "application/json" },
        body: JSON.stringify({ text: "Проверь сервер", risk: 0, approved: true, requestId: "http-1" }),
      }),
    );
    const body = await command.json();
    assert.equal(body.code, "OK");
    assert.equal(body.trace.runbook, "server.health");
    assert.equal(body.trace.risk, 0);
    assert.equal(body.executionCalled, false);
  });
});
