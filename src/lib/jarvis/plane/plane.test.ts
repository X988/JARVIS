import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { correlate, openIncident } from "./incidents.ts";
import { agentMayEscalate, routeModel } from "./llm.ts";
import { proposeCriticalInfrastructureFact, remember, searchMemory } from "./memory.ts";
import { validatePlugin } from "./plugins.ts";
import {
  cancelTask,
  createOneTimeTask,
  createRecurringTask,
  isTaskDue,
  loadTasks,
  pauseTask,
  resumeTask,
  runDue,
  saveTasks,
} from "./scheduler.ts";
import { normalizeHeard, ttsMode, wakeEnabled } from "./speech.ts";
import { acceptTelegram, type TelegramActor } from "./telegram.ts";
import { claimNext, codingWorkspace, openJob, updateJob, workerAction, worktreePath } from "./workers.ts";

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-plane-"));
}

const actors: Record<string, TelegramActor> = { "100842": { actorId: "admin1", role: "operator" } };

describe("telegram and voice", () => {
  it("ignores username and denies an unknown numeric id", () => {
    const result = acceptTelegram(
      { updateId: 1, userId: 50, username: "admin1", text: "Проверь сервер" },
      { stateDir: dir(), actors, now: new Date("2026-10-07T08:00:00Z") },
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.code, "ACTOR_DENIED");
  });

  it("does not invent text for a voice message", () => {
    const result = acceptTelegram(
      { updateId: 2, userId: 100842, voiceFileId: "abc" },
      { stateDir: dir(), actors, now: new Date("2026-10-07T08:00:00Z") },
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.code, "STT_UNAVAILABLE");
  });

  it("sends an allowed text through the pipeline and denies a drop", () => {
    const result = acceptTelegram(
      { updateId: 3, userId: 100842, text: "Удали базу utp" },
      { stateDir: dir(), actors, now: new Date("2026-10-07T08:00:00Z") },
    );
    assert.equal(result.accepted, true);
    if (result.accepted) assert.equal(result.result.code, "POLICY_DENIED");
  });

  it("accepts a numeric id from the actor map, not from the demo operator list", () => {
    const result = acceptTelegram(
      { updateId: 4, userId: 424242, text: "Проверь сервер" },
      {
        stateDir: dir(),
        actors: { "424242": { actorId: "ops2", role: "operator" } },
        now: new Date("2026-10-07T08:00:00Z"),
      },
    );
    assert.equal(result.accepted, true);
  });

  it("does not authorize JARVIS_TELEGRAM_IDS", () => {
    const previous = process.env.JARVIS_TELEGRAM_IDS;
    const actorsEnv = process.env.JARVIS_TELEGRAM_ACTORS_JSON;
    process.env.JARVIS_TELEGRAM_IDS = "100842";
    delete process.env.JARVIS_TELEGRAM_ACTORS_JSON;
    try {
      const result = acceptTelegram(
        { updateId: 5, userId: 100842, text: "Проверь сервер" },
        { stateDir: dir(), now: new Date("2026-10-07T08:00:00Z") },
      );
      assert.equal(result.accepted, false);
    } finally {
      if (previous === undefined) delete process.env.JARVIS_TELEGRAM_IDS;
      else process.env.JARVIS_TELEGRAM_IDS = previous;
      if (actorsEnv === undefined) delete process.env.JARVIS_TELEGRAM_ACTORS_JSON;
      else process.env.JARVIS_TELEGRAM_ACTORS_JSON = actorsEnv;
    }
  });

  it("keeps a low-confidence alias unchanged", () => {
    assert.equal(normalizeHeard("проверь ютп", 0.4).changed, false);
    assert.equal(normalizeHeard("проверь ютп", 0.9).text.includes("utp"), true);
    assert.equal(wakeEnabled({}), false);
    assert.equal(ttsMode({}), "disabled");
  });
});

describe("memory, schedule, workers", () => {
  it("refuses to store a credential as infrastructure memory", () => {
    const root = dir();
    const saved = remember(root, {
      id: "1",
      kind: "infrastructure",
      at: "2026-10-01T00:00:00Z",
      source: "operator",
      text: "пароль sql01 хранится в сейфе",
    });
    assert.equal(saved.ok, false);
  });

  it("finds ranked memory with source, date and snippet", () => {
    const root = dir();
    remember(root, {
      id: "2",
      kind: "incident",
      at: "2026-09-30T00:00:00Z",
      source: "incident:mailcow-42",
      text: "На прошлой неделе на Mailcow кончалось место на диске.",
    });
    remember(root, {
      id: "3",
      kind: "development",
      at: "2026-09-29T00:00:00Z",
      source: "git:repo",
      text: "В Mailcow документации обновили заметку.",
    });
    const found = searchMemory(root, "почему mailcow диск", { kinds: ["incident"], limit: 3 });
    assert.equal(found.length, 1);
    assert.equal(found[0].source, "incident:mailcow-42");
    assert.equal(found[0].at, "2026-09-30T00:00:00Z");
    assert.match(found[0].snippet, /Mailcow.*диск/i);
    assert.equal(found[0].score > 0, true);
  });

  it("never lets memory mutate critical inventory facts", () => {
    const root = dir();
    const note = {
      id: "critical-1",
      kind: "infrastructure" as const,
      at: "2026-10-07T00:00:00Z",
      source: "operator",
      text: "IP сервера sql01 10.0.0.5",
    };
    assert.equal(remember(root, note).ok, false);
    assert.equal(proposeCriticalInfrastructureFact(note).code, "CONTROLLED_WORKFLOW_REQUIRED");
    assert.equal(searchMemory(root, "10.0.0.5").length, 0);
  });

  it("refuses secrets in every memory category and duplicate ids", () => {
    const root = dir();
    assert.equal(
      remember(root, {
        id: "secret-1",
        kind: "conversation",
        at: "2026-10-07T00:00:00Z",
        source: "chat",
        text: "password=supersecret",
      }).ok,
      false,
    );
    const note = {
      id: "stable-1",
      kind: "procedure" as const,
      at: "2026-10-07T00:00:00Z",
      source: "runbook:mailcow.health",
      text: "Проверка Mailcow завершилась успешно.",
    };
    assert.equal(remember(root, note).ok, true);
    assert.equal(remember(root, note).ok, false);
  });

  it("runs a due check through the callback and not around it", () => {
    const root = dir();
    const now = new Date("2026-10-07T06:00:00Z");
    saveTasks(root, [
      { id: "morning", text: "Проверь сервер", timezone: "UTC", cron: "0 6 * * *", status: "active", history: [] },
    ]);
    assert.equal(isTaskDue(loadTasks(root)[0], now), true);
    const fired = runDue(root, now, () => ({ code: "DRY" }));
    assert.deepEqual(fired, [{ id: "morning", code: "DRY" }]);
  });

  it("runs a one-time task once and supports pause/resume/cancel", () => {
    const root = dir();
    const once = createOneTimeTask({
      id: "backup-check",
      text: "Проверь backup utp",
      runAt: "2026-10-07T06:00:00Z",
      timezone: "Europe/Kyiv",
    });
    const recurring = createRecurringTask({
      id: "mailcow-hourly",
      text: "Проверь Mailcow, ничего не меняй",
      cron: "0 * * * *",
      timezone: "Europe/Kyiv",
    });
    assert.ok(once);
    assert.ok(recurring);
    saveTasks(root, [once!, recurring!]);
    assert.equal(pauseTask(root, "mailcow-hourly")?.status, "paused");
    assert.equal(resumeTask(root, "mailcow-hourly")?.status, "active");
    assert.equal(cancelTask(root, "mailcow-hourly")?.status, "cancelled");
    const first = runDue(root, new Date("2026-10-07T06:00:01Z"), () => ({ code: "OK" }));
    assert.deepEqual(first, [{ id: "backup-check", code: "OK" }]);
    assert.equal(loadTasks(root).find((task) => task.id === "backup-check")?.status, "completed");
    assert.equal(runDue(root, new Date("2026-10-07T06:05:00Z"), () => ({ code: "SHOULD_NOT_RUN" })).length, 0);
  });

  it("blocks production actions from a worker", () => {
    assert.equal(workerAction("push-main").code, "DENY");
    assert.equal(workerAction("production-secret").code, "DENY");
    assert.equal(workerAction("self-heal").code, "DENY");
    assert.equal(workerAction("shell-production").code, "DENY");
    assert.equal(worktreePath("/repo", "../x"), null);
    assert.equal(worktreePath("/repo", "task-1")?.endsWith(`${path.sep}task-1`), true);
  });

  it("keeps coding workers isolated and bounded by concurrency", () => {
    const workspace = codingWorkspace("/repo", "fix-ci-1");
    assert.ok(workspace);
    assert.match(workspace!.branch, /^jarvis\/task-/);
    assert.equal(workspace!.productionCredentials, false);
    assert.equal(workspace!.steps.at(-1), "pr");

    const first = openJob("job-1", "coding", new Date("2026-10-07T00:00:00Z"));
    const second = openJob("job-2", "research", new Date("2026-10-07T00:00:01Z"));
    const claimed = claimNext([first, second], 1, new Date("2026-10-07T00:00:02Z"));
    assert.equal(claimed.claimed?.id, "job-1");
    assert.equal(claimed.claimed?.status, "running");
    assert.equal(claimNext(claimed.jobs, 1).claimed, null);

    const advanced = updateJob(claimed.claimed!, { progress: 50, phase: "test", log: "tests running" });
    const regressed = updateJob(advanced, { progress: 10 });
    assert.equal(regressed.progress, 50);
    assert.match(regressed.logs.join("\n"), /tests running/);
  });
});

describe("plugins, incidents, models", () => {
  it("rejects an unknown plugin and a shell permission", () => {
    assert.equal(validatePlugin({ id: "ups" }).ok, false);
    const shell = validatePlugin({
      id: "ups",
      version: "1",
      description: "status",
      inputs: [],
      outputs: [],
      risk: 0,
      permissions: ["shell"],
      supported_targets: [],
      runbook: "ups.status",
    });
    assert.equal(shell.ok, false);
  });

  it("links backup pressure without starting a repair", () => {
    const incident = openIncident({
      id: "inc-1",
      startedAt: "2026-10-07T06:00:00Z",
      source: "demo",
      target: "sql01",
      severity: "warn",
    });
    assert.equal(incident.status, "open");
    assert.match(correlate([{ title: "sql backup" }, { title: "disk io" }, { title: "1С тормозит" }]) ?? "", /связь/);
  });

  it("does not let model choice raise permission", () => {
    assert.equal(routeModel("coding").permission, "unchanged");
    assert.equal(agentMayEscalate(), false);
  });
});
