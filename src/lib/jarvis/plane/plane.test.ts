import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { closeIncident, correlate, createIncident, loadIncidents, openIncident, updateIncident } from "./incidents.ts";
import { agentMayEscalate, llmMayReceiveSecretValues, providersFromEnv as llmProvidersFromEnv, routeModel } from "./llm.ts";
import { proposeCriticalInfrastructureFact, remember, searchMemory } from "./memory.ts";
import {
  AlertmanagerProvider,
  PrometheusProvider,
  admitMonitoringAction,
  monitoringStatus,
  providersFromEnv as monitoringProvidersFromEnv,
  type MonitorRunner,
} from "../monitoring.ts";
import { admitPlugin, loadPluginDir, validatePlugin } from "./plugins.ts";
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
import {
  BrowserSpeechProvider,
  WhisperProvider,
  normalizeHeard,
  ttsMode,
  wakeEnabled,
} from "./speech.ts";
import { acceptTelegram, type TelegramActor } from "./telegram.ts";
import { loadJobs } from "./jobs.ts";
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

  it("keeps browser and whisper.cpp STT providers as untrusted transcription only", () => {
    const browser = new BrowserSpeechProvider();
    const browserHit = browser.transcribe({ transcript: "Проверь Mailcow", confidence: 0.72 });
    assert.equal("provider" in browserHit ? browserHit.provider : "", "browser");
    assert.equal("confidence" in browserHit ? browserHit.confidence : 0, 0.72);

    const root = dir();
    const whisper = new WhisperProvider(
      {
        JARVIS_AUDIO_DIR: root,
        JARVIS_WHISPER_CPP_WRAPPER: "/opt/jarvis/bin/whisper-wrapper",
      },
      (_executable, args) => ({
        status: 0,
        stdout: JSON.stringify({ text: "Проверь SQL", confidence: 0.88 }),
      }),
    );
    const hit = whisper.transcribe({ wavPath: path.join(root, "voice.wav") });
    assert.equal("provider" in hit ? hit.provider : "", "whisper-cpp");
    assert.equal("text" in hit ? hit.text : "", "Проверь SQL");
    assert.equal(whisper.transcribe({ wavPath: path.join(root, "..", "escape.wav") }).code, "STT_FAILED");
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

  it("rejects malformed memory kinds and oversized records", () => {
    const root = dir();
    const badKind = remember(
      root,
      {
        id: "bad-kind",
        kind: "arbitrary",
        at: "2026-10-07T00:00:00Z",
        source: "test",
        text: "safe text",
      } as Parameters<typeof remember>[1],
    );
    assert.equal(badKind.ok, false);

    const huge = remember(root, {
      id: "huge",
      kind: "conversation",
      at: "2026-10-07T00:00:00Z",
      source: "chat",
      text: "x".repeat(20_001),
    });
    assert.equal(huge.ok, false);
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

  it("fails closed on corrupted scheduler and worker state instead of executing it", () => {
    const root = dir();
    fs.writeFileSync(
      path.join(root, "schedule.json"),
      JSON.stringify([
        { id: "broken", text: "Проверь Mailcow", timezone: "UTC", cron: "0 * * * *", status: "active" },
        { id: "evil", text: "Удали базу", timezone: "Mars/Olympus", cron: "* * * * *", status: "active", history: [] },
      ]),
    );
    assert.throws(() => loadTasks(root), /schedule state invalid/);

    fs.writeFileSync(
      path.join(root, "jobs.json"),
      JSON.stringify([
        { id: "bad", kind: "coding", status: "running", progress: "100", phase: "x", logs: [] },
        { id: "bad2", kind: "unknown", status: "queued", progress: 0, phase: "x", logs: [], result: null, error: null, createdAt: "x", updatedAt: "x" },
      ]),
    );
    assert.throws(() => loadJobs(root), /worker state invalid/);
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

    const completed = updateJob(regressed, { status: "done", progress: 80, result: "ok" });
    assert.equal(completed.status, "done");
    assert.equal(completed.progress, 100);
    const resurrected = updateJob(completed, { status: "running", progress: 100, log: "must not run" });
    assert.equal(resurrected.status, "done");
    assert.equal(resurrected.logs.includes("must not run"), false);

    const cancelled = updateJob(openJob("job-3", "coding"), { status: "cancelled", phase: "cancelled" });
    assert.equal(updateJob(cancelled, { status: "running" }).status, "cancelled");
  });
});

describe("plugins, incidents, models", () => {
  it("rejects malformed, shell, and capability-escalating plugins", () => {
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

    const secret = validatePlugin({
      id: "ups",
      version: "1",
      description: "status",
      inputs: [],
      outputs: [],
      risk: 0,
      permissions: ["production-secret"],
      supported_targets: ["mail01"],
      runbook: "mailcow.health",
    });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.equal(secret.code, "PERMISSION_DENIED");

    const incomplete = validatePlugin({
      id: "ups",
      version: "1",
      description: "status",
      inputs: [],
      risk: 0,
      permissions: [],
      supported_targets: ["mail01"],
      runbook: "mailcow.health",
    });
    assert.equal(incomplete.ok, false);

    const bypass = admitPlugin({
      id: "mailcow-bypass",
      version: "1",
      description: "status",
      inputs: [],
      outputs: [],
      risk: 0,
      permissions: ["shell"],
      supported_targets: ["mail01"],
      runbook: "mailcow.health",
    }, "mail01");
    assert.equal(bypass.code, "DENY");
  });

  it("accepts only bounded regular plugin manifest files", () => {
    const root = dir();
    fs.writeFileSync(
      path.join(root, "mailcow.json"),
      JSON.stringify({
        id: "mailcow-check",
        version: "1.0.0",
        description: "Read-only Mailcow status",
        inputs: ["target"],
        outputs: ["status"],
        risk: 0,
        permissions: ["network:read"],
        supported_targets: ["mail01"],
        runbook: "mailcow.health",
      }),
    );
    fs.writeFileSync(path.join(root, "bad.json"), JSON.stringify({ id: "bad" }));
    const loaded = loadPluginDir(root);
    assert.equal(loaded.accepted.length, 1);
    assert.equal(loaded.accepted[0].id, "mailcow-check");
    assert.deepEqual(loaded.rejected, ["bad.json"]);
  });

  it("persists an incident lifecycle and refuses secret-bearing findings", () => {
    const root = dir();
    const created = createIncident(root, {
      id: "inc-mailcow-1",
      startedAt: "2026-10-07T06:00:00Z",
      source: "monitoring",
      target: "mail01",
      severity: "warn",
    });
    assert.equal(created.ok, true);
    assert.equal(createIncident(root, {
      id: "inc-mailcow-1",
      startedAt: "2026-10-07T06:01:00Z",
      source: "monitoring",
      target: "mail01",
      severity: "warn",
    }).ok, false);

    const secret = updateIncident(root, "inc-mailcow-1", { finding: "password=do-not-store" });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.equal(secret.code, "SECRET");

    const updated = updateIncident(
      root,
      "inc-mailcow-1",
      {
        finding: "Очередь Postfix растёт.",
        suggested: "Проверить состояние postfix-mailcow без изменений.",
        timeline: "finding recorded",
      },
      new Date("2026-10-07T06:05:00Z"),
    );
    assert.equal(updated.ok, true);
    assert.equal(loadIncidents(root)[0].findings.length, 1);

    const closed = closeIncident(root, "inc-mailcow-1", "Очередь нормализовалась.", new Date("2026-10-07T06:10:00Z"));
    assert.equal(closed.ok, true);
    assert.equal(loadIncidents(root)[0].status, "closed");
    const resurrect = updateIncident(root, "inc-mailcow-1", { finding: "must not reopen" });
    assert.equal(resurrect.ok, false);
    if (!resurrect.ok) assert.equal(resurrect.code, "CLOSED");
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

  it("denies monitoring self-heal unless policy explicitly routes it through Gateway", () => {
    assert.equal(admitMonitoringAction("observe").code, "ALLOW");
    assert.equal(admitMonitoringAction("suggest").code, "ALLOW");
    assert.equal(admitMonitoringAction("self-heal").code, "DENY");

    const unknown = admitMonitoringAction("self-heal", {
      policyAllowsRepair: true,
      runbook: "unknown.repair",
      target: "mail01",
    });
    assert.equal(unknown.code, "DENY");

    const admitted = admitMonitoringAction("self-heal", {
      policyAllowsRepair: true,
      runbook: "sql.backup",
      target: "utp",
    });
    assert.equal(admitted.code, "GATEWAY");
  });

  it("reports Alertmanager and actual SSH/Mailcow env names without pretending they are live", () => {
    const env = {
      JARVIS_ALERTMANAGER_URL: "https://alerts.example",
      JARVIS_SSH_TARGETS_JSON: '{"mail01":"mail01.example"}',
      JARVIS_DOCKER_HOST: "mail01.example",
    };
    assert.match(monitoringStatus(env), /alertmanager:CONFIGURED_UNPROBED/);
    const ids = monitoringProvidersFromEnv(env).map((provider) => provider.id);
    assert.equal(ids.includes("alertmanager"), true);
    assert.equal(ids.includes("linux"), true);
    assert.equal(ids.includes("mailcow"), true);
  });

  it("collects live monitoring only through fixed provider adapters", () => {
    const runner: MonitorRunner = (provider) => ({
      code: "OK",
      detail: "events=1",
      events: [
        {
          source: provider,
          target: "mail01",
          at: "2026-10-07T00:00:00Z",
          severity: "bad",
          evidence: "fixed probe",
          runbook: null,
          mode: "live",
          title: "Target down",
        },
      ],
    });
    const prometheus = new PrometheusProvider({ JARVIS_PROMETHEUS_URL: "https://prom.example" }, runner);
    assert.equal(prometheus.status(), "CONFIGURED_UNPROBED");
    assert.equal(prometheus.probe().status, "OK");
    assert.equal(prometheus.collect()[0]?.target, "mail01");
    const alertmanager = new AlertmanagerProvider({ JARVIS_ALERTMANAGER_URL: "ftp://bad.example" }, runner);
    assert.equal(alertmanager.status(), "NOT_CONFIGURED");
    assert.equal(alertmanager.collect().length, 0);
  });

  it("does not let model choice raise permission or expose secret values", () => {
    const env = {
      JARVIS_LLM_INTENT_PROVIDER: "openai",
      JARVIS_LLM_INTENT_MODEL: "small-model",
      JARVIS_LLM_CODING_PROVIDER: "anthropic",
      JARVIS_LLM_CODING_MODEL: "strong-model",
      JARVIS_LLM_SENSITIVE_PROVIDER: "ollama",
      JARVIS_LLM_SENSITIVE_MODEL: "local-model",
      JARVIS_OLLAMA_URL: "http://127.0.0.1:11434",
      OPENAI_API_KEY: "secret-openai",
      ANTHROPIC_API_KEY: "secret-anthropic",
    };
    assert.equal(routeModel("coding", env).provider, "anthropic");
    assert.equal(routeModel("coding", env).permission, "unchanged");
    assert.equal(routeModel("sensitive", env).local, true);
    assert.equal(agentMayEscalate(), false);
    assert.equal(llmMayReceiveSecretValues(), false);
    const providers = llmProvidersFromEnv(env);
    assert.equal(providers.find((item) => item.id === "openai")?.credentialRef, "OPENAI_API_KEY");
    assert.equal(JSON.stringify(providers).includes("secret-openai"), false);
  });
});
