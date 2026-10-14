import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { handleCommand, handleSession } from "./http.ts";
import { processCommand, type ExecCall } from "./pipeline.ts";
import { evaluateRuntimePolicy, maintenanceWindowOpen } from "./policy.ts";
import type { Session } from "./session.ts";

const now = new Date("2026-10-07T08:00:00Z");
const admin: Session = { id: "sess-admin", accountId: "admin1", role: "operator", expiresAt: now.getTime() + 60 * 60_000 };
const stranger: Session = { id: "sess-stranger", accountId: "stranger", role: "none", expiresAt: now.getTime() + 60 * 60_000 };

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
    approval: extra.approval,
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

  it("executes an approved mutating request only once per request id", () => {
    const stateDir = freshDir();
    let calls = 0;
    const execute = (_call: ExecCall) => {
      calls += 1;
      return { called: true, code: "OK", detail: "verified" };
    };
    const opened = run("Сделай резервную копию базы utp", { stateDir, requestId: "open-backup", mode: "real", execute });
    assert.equal(opened.code, "APPROVAL_REQUIRED");
    assert.ok(opened.approval);
    const confirm = {
      id: opened.approval!.id,
      confirmation: opened.approval!.phrase,
    };
    const first = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "confirm-same",
      mode: "real",
      execute,
      approval: confirm,
    });
    const second = run("Сделай резервную копию базы utp", {
      stateDir,
      requestId: "confirm-same",
      mode: "real",
      execute,
      approval: confirm,
    });
    assert.equal(first.code, "OK");
    assert.equal(second.duplicate, true);
    assert.equal(calls, 1);
  });

  it("passes only server-derived parameters to an approved executor", () => {
    const stateDir = freshDir();
    const captured: ExecCall[] = [];
    const command = "Сделай резервную копию базы utp";
    const opened = run(command, {
      stateDir,
      requestId: "open-server-params",
      mode: "real",
      forged: { parameters: { database: "master", destination: "C:\\evil" }, runbook: "database.drop" },
      execute: (call) => {
        captured.push(call);
        return { called: true, code: "OK", detail: "verified" };
      },
    });
    assert.equal(opened.code, "APPROVAL_REQUIRED");
    assert.ok(opened.approval);

    const confirmed = run(command, {
      stateDir,
      requestId: "confirm-server-params",
      mode: "real",
      forged: { parameters: { database: "master", destination: "C:\\evil" }, approved: true },
      execute: (call) => {
        captured.push(call);
        return { called: true, code: "OK", detail: "verified" };
      },
      approval: {
        id: opened.approval!.id,
        confirmation: opened.approval!.phrase,
      },
    });

    assert.equal(confirmed.code, "OK");
    assert.equal(captured.length, 1);
    const executed = captured[0];
    assert.ok(executed);
    assert.equal(executed.runbook, "sql.backup");
    assert.equal(executed.target, "utp");
    assert.equal(executed.parameters?.database, "utp");
    assert.equal(executed.parameters?.server, "sql01");
    assert.equal(executed.parameters?.destination, "nas-backup/sql");
    assert.notEqual(executed.parameters?.database, "master");
  });

  it("does not replay one actor's command for another actor with the same request id", () => {
    const stateDir = freshDir();
    const first = run("Проверь сервер", { stateDir, requestId: "shared-id" });
    const second = run("Удали базу utp", { stateDir, requestId: "shared-id", session: stranger });
    assert.equal(first.code, "OK");
    assert.equal(second.code, "ACTOR_DENIED");
    assert.notEqual(second.trace.runbook, first.trace.runbook);
  });

  it("expires an approval and invalidates it when server-normalized parameters change", () => {
    const stateDir = freshDir();
    const command = "Сделай резервную копию базы utp";
    const opened = run(command, { stateDir, now });
    assert.ok(opened.approval);
    const expired = processCommand({
      text: command,
      requestId: "confirm-late",
      session: admin,
      stateDir,
      now: new Date(now.getTime() + 10 * 60 * 1000),
      mode: "dry-run",
      approval: { id: opened.approval!.id, confirmation: opened.approval!.phrase },
    });
    assert.equal(expired.code, "APPROVAL_EXPIRED");

    const again = run(command, { stateDir, now, requestId: "backup-2" });
    assert.ok(again.approval);
    const mismatch = processCommand({
      text: command + ", ничего не меняй",
      requestId: "confirm-bad",
      session: admin,
      stateDir,
      now,
      mode: "real",
      execute: () => {
        throw new Error("executor must not be called");
      },
      approval: { id: again.approval!.id, confirmation: again.approval!.phrase },
    });
    assert.equal(mismatch.code, "APPROVAL_MISMATCH");
    assert.equal(mismatch.executionCalled, false);
  });

  it("fails closed on corrupted idempotency state", () => {
    const stateDir = freshDir();
    fs.writeFileSync(path.join(stateDir, "idempotency.json"), '{"bad":{"state":"pending","at":"not-a-number"}}');
    assert.throws(
      () => run("Проверь сервер", { stateDir, requestId: "safe-id" }),
      /idempotency state contains an invalid entry/,
    );
  });

  it("rejects an approval record tampered on disk", () => {
    const stateDir = freshDir();
    const command = "Сделай резервную копию базы utp";
    const opened = run(command, { stateDir, requestId: "approval-open" });
    assert.equal(opened.code, "APPROVAL_REQUIRED");
    assert.ok(opened.approval);

    const file = path.join(stateDir, "approvals.json");
    const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Array<Record<string, unknown>>;
    rows[0].target = "master";
    fs.writeFileSync(file, JSON.stringify(rows));

    assert.throws(
      () =>
        run(command, {
          stateDir,
          requestId: "approval-confirm",
          approval: { id: opened.approval!.id, confirmation: opened.approval!.phrase },
        }),
      /approval state has invalid records/,
    );
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

  it("does not run a real adapter when the server mode stays dry-run", () => {
    const previous = process.env.EXECUTION_MODE;
    delete process.env.EXECUTION_MODE;
    let calls = 0;
    try {
      const result = run("Проверь сервер", {
        execute: () => {
          calls += 1;
          return { called: true, code: "OK", detail: "должен был не вызваться" };
        },
      });
      assert.equal(result.trace.mode, "dry-run");
      assert.equal(calls, 0);
      assert.equal(result.executionCalled, false);
    } finally {
      if (previous === undefined) delete process.env.EXECUTION_MODE;
      else process.env.EXECUTION_MODE = previous;
    }
  });

  it("calls a read-only executor once for a repeated request id", () => {
    const stateDir = freshDir();
    let calls = 0;
    const execute = () => {
      calls += 1;
      return { called: true, code: "NOT_CONFIGURED", detail: "нет канала" };
    };
    const first = run("Проверь сервер", { stateDir, requestId: "health-once", mode: "real", execute });
    const second = run("Проверь сервер", { stateDir, requestId: "health-once", mode: "real", execute });
    assert.equal(first.code, "EXECUTION_DISABLED");
    assert.equal(second.duplicate, true);
    assert.equal(calls, 1);
  });

  it("reports an unconfigured read-only adapter instead of success", () => {
    const names = [
      "JARVIS_WINDOWS_HOST",
      "JARVIS_WINDOWS_TARGETS_JSON",
      "JARVIS_WINDOWS_USER",
      "JARVIS_WINDOWS_PASSWORD",
      "JARVIS_SSH_HOST",
      "JARVIS_SSH_TARGETS_JSON",
      "JARVIS_SSH_USER",
      "JARVIS_SSH_KEY_FILE",
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    try {
      const result = run("Проверь сервер", { mode: "real" });
      assert.equal(result.executionCalled, false);
      assert.equal(result.code, "EXECUTION_DISABLED");
      assert.match(result.trace.execution, /не подключён|NOT_CONFIGURED/);
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe("command http", () => {
  it("requires a server actor and ignores forged security fields", async () => {
    process.env.JARVIS_STATE_DIR = freshDir();
    process.env.JARVIS_TEST_AUTH = "1";
    const testHeader = { "x-jarvis-test-actor": "admin1" };
    const anon = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Проверь сервер" }),
    }));
    assert.equal((await anon.json()).code, "AUTH_REQUIRED");

    const opened = await handleSession(new Request("http://127.0.0.1/api/session", { headers: testHeader }));
    assert.equal(opened.status, 200);
    const csrf = opened.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
    const token = decodeURIComponent(csrf.split("=")[1] ?? "");

    const command = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: {
        ...testHeader,
        cookie: csrf,
        "x-jarvis-csrf": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "Проверь сервер",
        risk: 0,
        role: "admin",
        policy: "ALLOW",
        approved: true,
        request_id: "http-1",
      }),
    }));
    const body = await command.json();
    assert.equal(body.code, "OK");
    assert.equal(body.trace.runbook, "server.health");
    assert.equal(body.trace.risk, 0);
    assert.equal(body.executionCalled, false);

    const forged = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: {
        ...testHeader,
        cookie: csrf,
        "x-jarvis-csrf": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "Сделай резервную копию базы utp",
        risk: 0,
        approved: true,
        mode: "real",
        request_id: "http-backup",
      }),
    }));
    const backup = await forged.json();
    assert.equal(backup.code, "APPROVAL_REQUIRED");
    assert.equal(backup.trace.mode, "dry-run");
    assert.equal(backup.trace.risk, 2);
    assert.equal(backup.executionCalled, false);
  });
});


describe("HTTP input hardening", () => {
  it("rejects malformed bodies and unsafe request ids without throwing", async () => {
    process.env.JARVIS_STATE_DIR = freshDir();
    process.env.JARVIS_TEST_AUTH = "1";
    const testHeader = { "x-jarvis-test-actor": "admin1" };

    const session = await handleSession(new Request("http://127.0.0.1/api/session", {
      headers: { ...testHeader, cookie: "jarvis_csrf=%E0%A4%A; __proto__=polluted" },
    }));
    assert.equal(session.status, 200);
    const csrf = session.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
    const token = decodeURIComponent(csrf.split("=")[1] ?? "");

    const nullBody = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: {
        ...testHeader,
        cookie: csrf,
        "x-jarvis-csrf": token,
        "content-type": "application/json",
      },
      body: "null",
    }));
    assert.equal(nullBody.status, 400);

    const polluted = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: {
        ...testHeader,
        cookie: csrf,
        "x-jarvis-csrf": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "Проверь сервер", request_id: "__proto__" }),
    }));
    assert.equal(polluted.status, 400);

    const oversizedText = await handleCommand(new Request("http://127.0.0.1/api/commands", {
      method: "POST",
      headers: {
        ...testHeader,
        cookie: csrf,
        "x-jarvis-csrf": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "x".repeat(4001) }),
    }));
    assert.equal(oversizedText.status, 400);
  });
});

describe("extended policy gates", () => {
  it("keeps dry-run-only actions out of mock and real", () => {
    assert.equal(evaluateRuntimePolicy("DRY_RUN_ONLY", { mode: "dry-run" }).code, "ALLOW");
    assert.equal(evaluateRuntimePolicy("DRY_RUN_ONLY", { mode: "mock" }).code, "DENY");
    assert.equal(evaluateRuntimePolicy("DRY_RUN_ONLY", { mode: "real" }).code, "DENY");
  });

  it("requires explicit server-side elevation", () => {
    assert.equal(evaluateRuntimePolicy("ELEVATION_REQUIRED", { mode: "real" }).code, "DENY");
    assert.equal(
      evaluateRuntimePolicy("ELEVATION_REQUIRED", { mode: "real", elevated: true }).code,
      "ALLOW",
    );
  });

  it("evaluates a Kyiv maintenance window including an overnight range", () => {
    const env = { JARVIS_TIMEZONE: "Europe/Kyiv", JARVIS_MAINTENANCE_WINDOW: "22:00-06:00" };
    assert.equal(maintenanceWindowOpen(new Date("2026-10-07T20:30:00Z"), env), true);
    assert.equal(maintenanceWindowOpen(new Date("2026-10-07T08:00:00Z"), env), false);
    assert.equal(
      evaluateRuntimePolicy("MAINTENANCE_WINDOW_REQUIRED", {
        mode: "real",
        maintenanceWindow: false,
      }).code,
      "DENY",
    );
  });
});

describe("reverse proxy csrf", () => {
  async function csrfToken() {
    process.env.JARVIS_STATE_DIR = freshDir();
    process.env.JARVIS_TEST_AUTH = "1";
    const opened = await handleSession(
      new Request("http://127.0.0.1:8095/api/session", {
        headers: { "x-jarvis-test-actor": "admin1" },
      }),
    );
    const csrf = opened.headers.getSetCookie().find((line) => line.startsWith("jarvis_csrf="))?.split(";")[0] ?? "";
    const token = decodeURIComponent(csrf.split("=")[1] ?? "");
    return { csrf, token };
  }

  async function post(origin: string, extra: Record<string, string> = {}) {
    const { csrf, token } = await csrfToken();
    return handleCommand(
      new Request("http://127.0.0.1:8095/api/commands", {
        method: "POST",
        headers: {
          "x-jarvis-test-actor": "admin1",
          cookie: csrf,
          "x-jarvis-csrf": token,
          origin,
          "content-type": "application/json",
          ...extra,
        },
        body: JSON.stringify({ text: "Проверь сервер", request_id: "proxy-csrf-1" }),
      }),
    );
  }

  it("accepts the public HTTPS origin configured for the proxy", async () => {
    const previous = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://192.168.0.184:9443/";
    try {
      const response = await post("https://192.168.0.184:9443");
      assert.equal((await response.json()).code, "OK");
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previous;
    }
  });

  it("accepts X-Forwarded-Host when it matches the browser origin", async () => {
    const previousUrl = process.env.BETTER_AUTH_URL;
    const previousTrusted = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    try {
      const response = await post("https://192.168.0.184:9443", {
        "x-forwarded-host": "192.168.0.184:9443",
        "x-forwarded-proto": "https",
      });
      assert.equal((await response.json()).code, "OK");
    } finally {
      if (previousUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousUrl;
      if (previousTrusted === undefined) delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
      else process.env.BETTER_AUTH_TRUSTED_ORIGINS = previousTrusted;
    }
  });

  it("rejects a foreign origin", async () => {
    const previousUrl = process.env.BETTER_AUTH_URL;
    const previousTrusted = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    try {
      const response = await post("https://evil.example");
      assert.equal((await response.json()).code, "AUTH_REQUIRED");
    } finally {
      if (previousUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousUrl;
      if (previousTrusted === undefined) delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
      else process.env.BETTER_AUTH_TRUSTED_ORIGINS = previousTrusted;
    }
  });
});
