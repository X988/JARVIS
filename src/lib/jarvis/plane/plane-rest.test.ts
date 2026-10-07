import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { agentOutputMayCallExecutor, planAgents, runAgents } from "./agents.ts";
import { deliverArtifact, resolveArtifactFile } from "./artifacts.ts";
import { browserIntent, browserMaySubmitCredentials, browserPlan, readBrowserUrl } from "./browser.ts";
import { codingChecks, codingDiff, prepareCodingWorktree, workerMayPublish, type GitRunner } from "./coding-worktree.ts";
import { activateRunbook, proposeRunbook } from "./drafts.ts";
import { cancelJob, enqueue, planForBranch, prMayLandOnMain } from "./jobs.ts";
import { admitMcp, admitMcpRunbook } from "./mcp.ts";
import { admitPlugin, loadPluginDir } from "./plugins.ts";
import { indexFolder, searchChunks } from "./rag.ts";
import { researchReport } from "./research.ts";
import { createOneTimeTask, createRecurringTask, isTaskDue, loadTasks, runDue, saveTasks, type ScheduledTask } from "./scheduler.ts";
import { telegramContext } from "./telegram.ts";
import { recordUndo } from "./undo.ts";
import { applyPrObservation, createPrWatch, prWatchMayMutateRepository } from "./pr-watch.ts";
import { admitRegisteredTool, listTools } from "./tool-registry.ts";

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-rest-"));
}

describe("remaining project ideas", () => {
  it("keeps telegram context out of the authorization decision", () => {
    assert.match(telegramContext({ updateId: 1, userId: 1, replyTo: "9", forwardedFromId: 4, documentName: "a.txt", imageFileId: "i", progress: "typing" }), /reply:9/);
  });

  it("refuses secrets, sensitive names, traversal and artifact symlink escapes", () => {
    const root = dir();
    assert.equal(deliverArtifact({ root, relative: "../key.txt", bytes: 10, text: "ok" }).ok, false);
    assert.equal(deliverArtifact({ root, relative: "diff.patch", bytes: 20, text: "password=secret" }).ok, false);
    assert.equal(deliverArtifact({ root, relative: "diff.patch", bytes: 20, text: "Authorization=BearerValue123456" }).ok, false);
    assert.equal(deliverArtifact({ root, relative: ".env", bytes: 20, text: "safe" }).ok, false);
    assert.equal(
      deliverArtifact({
        root,
        relative: "report.log",
        bytes: 70_100,
        text: "a".repeat(70_000) + "\ntoken=live-token-value-12345",
      }).ok,
      false,
    );
    assert.equal(deliverArtifact({ root, relative: "diff.patch", bytes: 20, text: "только diff" }).ok, true);

    const outsideDir = dir();
    const outside = path.join(outsideDir, "outside.txt");
    fs.writeFileSync(outside, "external");
    fs.symlinkSync(outside, path.join(root, "report.txt"));
    const escaped = resolveArtifactFile(root, "report.txt");
    assert.equal(escaped.ok, false);
    if (!escaped.ok) assert.equal(escaped.code, "PATH");
  });

  it("does not undo a reboot and does not activate a draft", () => {
    const root = dir();
    assert.equal(recordUndo(root, { kind: "reboot", at: "t", file: "", before: "", after: "" }).ok, false);
    const draft = { id: "ups", title: "UPS", steps: ["read"], reviewed: false };
    proposeRunbook(root, draft);
    assert.equal(activateRunbook(draft).code, "DENY");
  });

  it("searches local notes and rejects a research answer without sources", () => {
    const root = dir();
    fs.writeFileSync(path.join(root, "mail.md"), "Mailcow на прошлой неделе упирался в диск.\n\nВторое.");
    fs.mkdirSync(path.join(root, "onec"));
    fs.writeFileSync(path.join(root, "onec", "Module.bsl"), "Процедура ПроверитьUTP()\n// backup utp\nКонецПроцедуры");
    fs.writeFileSync(path.join(root, "query.sql"), "SELECT state_desc FROM sys.databases WHERE name = @name");
    fs.writeFileSync(path.join(root, "credentials.json"), JSON.stringify({ user: "u", password: "never-index" }));
    fs.writeFileSync(path.join(root, "runtime.json"), JSON.stringify({ token: "live-secret-value" }));
    const chunks = indexFolder(root);
    const found = searchChunks(chunks, "mailcow");
    assert.equal(found[0]?.source, "mail.md");
    assert.equal(searchChunks(chunks, "backup utp")[0]?.kind, "bsl");
    assert.equal(searchChunks(chunks, "state_desc")[0]?.kind, "sql");
    assert.equal(searchChunks(chunks, "state_desc")[0]?.source, "query.sql");
    assert.equal(chunks.some((chunk) => chunk.source === "credentials.json"), false);
    assert.equal(chunks.some((chunk) => chunk.source === "runtime.json"), false);
    assert.equal(chunks.some((chunk) => chunk.text.includes("live-secret-value")), false);
    assert.equal(researchReport("CVE", []).ok, false);
  });

  it("keeps agents, MCP and the browser behind the same deny", () => {
    assert.equal(runAgents("critic", ["опасно"]).mayExecute, false);
    assert.equal(planAgents("parallel").filter((step) => step.role === "analyst").length, 2);
    assert.equal(planAgents("sequential")[1]?.dependsOn[0], "collect");
    assert.equal(agentOutputMayCallExecutor(), false);
    assert.equal(admitMcp("unknown", ["docs.read"]).code, "DENY");
    assert.equal(admitMcp("docs.read", ["docs.read"]).code, "DISCOVERED");
    assert.equal(admitMcpRunbook("mailcow.health", "mail01", ["mailcow.health"]).code, "GATEWAY");
    assert.equal(admitMcpRunbook("unknown.tool", "mail01", ["unknown.tool"]).code, "DENY");
    assert.equal(admitMcpRunbook("database.drop", "utp", ["database.drop"]).code, "DENY");
    assert.equal(admitMcpRunbook("mailcow.health", "sql01", ["mailcow.health"]).code, "DENY");
    assert.equal(browserIntent("login").code, "DENY");
    assert.equal(browserIntent("read").code, "READ");
    assert.equal(browserMaySubmitCredentials(), false);
  });

  it("keeps browser reads on an explicit allowlist and blocks credential paths", async () => {
    const env = { JARVIS_BROWSER_ALLOW_HOSTS: "docs.example,github.com", JARVIS_BROWSER_MAX_BYTES: "4096" };
    assert.equal(browserPlan("https://docs.example/manual", "read", env).code, "READ");
    assert.equal(browserPlan("https://evil.example/manual", "read", env).code, "DENY");
    assert.equal(browserPlan("https://docs.example/login", "read", env).code, "DENY");
    assert.equal(browserPlan("https://user:pass@docs.example/manual", "read", env).code, "DENY");
    const fetched = await readBrowserUrl("https://docs.example/manual", {
      env,
      fetcher: async () =>
        new Response("safe documentation", {
          status: 200,
          headers: { "content-type": "text/plain", "content-length": "18" },
        }),
    });
    assert.equal(fetched.ok, true);
    if ("text" in fetched) assert.equal(fetched.text, "safe documentation");
  });

  it("derives tool authority from runbooks and inventory", () => {
    const tools = listTools();
    const mailcow = tools.find((tool) => tool.name === "mailcow.health");
    assert.equal(mailcow?.audit, true);
    assert.equal(mailcow?.risk, 0);
    assert.equal(admitRegisteredTool("mailcow.health", "mail01").code, "GATEWAY");
    assert.equal(admitRegisteredTool("mailcow.health", "sql01").code, "DENY");
    assert.equal(admitRegisteredTool("database.drop", "utp").code, "DENY");

    const plugin = {
      id: "mailcow-status",
      version: "1",
      description: "status",
      inputs: [],
      outputs: ["status"],
      risk: 0 as const,
      permissions: ["read"],
      supported_targets: ["mail01"],
      runbook: "mailcow.health",
    };
    assert.equal(admitPlugin(plugin, "mail01").code, "GATEWAY");
    assert.equal(admitPlugin({ ...plugin, risk: 2 }, "mail01").code, "DENY");
  });

  it("keeps local coding worktrees isolated and never publishes from a worker", () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const runner: GitRunner = (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (args[0] === "rev-parse") return { status: 0, stdout: cwd + "\n", stderr: "" };
      if (args[0] === "worktree") return { status: 0, stdout: "", stderr: "" };
      if (command === "npm") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { status: 0, stdout: "diff --git a/a b/a", stderr: "" };
      return { status: 1, stdout: "", stderr: "unexpected" };
    };
    const root = dir();
    fs.mkdirSync(path.join(root, ".git"));
    const prepared = prepareCodingWorktree(root, "ci-fix", "HEAD", runner);
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.match(prepared.branch, /^jarvis\/task-/);
    assert.equal(calls.some((call) => call.args.includes("main") || call.args.includes("master")), false);
    assert.equal(codingChecks(prepared.worktree, runner).ok, true);
    assert.equal(codingDiff(prepared.worktree, runner).ok, true);
    assert.equal(workerMayPublish("push"), false);
    assert.equal(workerMayPublish("merge"), false);
    assert.equal(workerMayPublish("deploy"), false);
  });

  it("watches PR CI read-only and resets to pending when head changes", () => {
    const watch = createPrWatch({
      id: "pr-1",
      repository: "X988/honey-granite-fair-hazel",
      pr: 1,
      head: "abcdef1234567",
      now: new Date("2026-10-07T00:00:00Z"),
    });
    assert.ok(watch);
    const passed = applyPrObservation(
      watch!,
      {
        head: "abcdef1234567",
        merged: false,
        checks: [{ name: "ci", conclusion: "success" }],
      },
      new Date("2026-10-07T00:01:00Z"),
    );
    assert.equal(passed.status, "passed");
    const moved = applyPrObservation(
      passed,
      {
        head: "1234567abcdef",
        merged: false,
        checks: [{ name: "ci", conclusion: "success" }],
      },
      new Date("2026-10-07T00:02:00Z"),
    );
    assert.equal(moved.status, "pending");
    assert.equal(prWatchMayMutateRepository(), false);
  });

  it("loads only a valid plugin and cancels a coding job off main", () => {
    const root = dir();
    fs.writeFileSync(
      path.join(root, "ups.json"),
      JSON.stringify({
        id: "ups",
        version: "1",
        description: "статус",
        inputs: [],
        outputs: [],
        risk: 0,
        permissions: ["read"],
        supported_targets: ["ups01"],
        runbook: "ups.status",
      }),
    );
    fs.writeFileSync(path.join(root, "bad.json"), "{}");
    const loaded = loadPluginDir(root);
    assert.equal(loaded.accepted.length, 1);
    assert.deepEqual(loaded.rejected, ["bad.json"]);
    const jobs = dir();
    enqueue(jobs, "task-1");
    assert.equal(cancelJob(jobs, "task-1")?.status, "cancelled");
    assert.equal(planForBranch("main").code, "DENY");
    assert.equal(planForBranch("fix-ci").steps.at(-1), "pr");
    assert.equal(prMayLandOnMain(), false);
  });

  it("accepts non-zero cron fields and rejects invalid persisted schedules", () => {
    const recurring = createRecurringTask({
      id: "backup-morning",
      text: "Проверь backup",
      cron: "5 8 * * *",
      timezone: "Europe/Kyiv",
    });
    assert.ok(recurring);
    assert.equal(isTaskDue(recurring!, new Date("2026-10-07T05:05:00Z")), true);

    assert.equal(
      createRecurringTask({
        id: "bad-minute",
        text: "Проверь backup",
        cron: "60 8 * * *",
        timezone: "Europe/Kyiv",
      }),
      null,
    );
    assert.equal(
      createOneTimeTask({
        id: "bad-zone",
        text: "Проверка",
        runAt: "2026-10-08T08:00:00Z",
        timezone: "Mars/Olympus",
      }),
      null,
    );

    const root = dir();
    fs.writeFileSync(
      path.join(root, "schedule.json"),
      JSON.stringify([
        {
          id: "bad-persisted",
          text: "never",
          timezone: "Europe/Kyiv",
          cron: "99 8 * * *",
          status: "active",
          history: [],
        },
      ]),
    );
    assert.deepEqual(loadTasks(root), []);
  });

  it("uses IANA timezones for cron and follows Kyiv DST", () => {
    const task: ScheduledTask = {
      id: "morning",
      text: "Проверь backup",
      timezone: "Europe/Kyiv",
      cron: "0 8 * * *",
      status: "active",
      history: [],
    };
    assert.equal(isTaskDue(task, new Date("2026-10-07T05:00:00Z")), true);
    assert.equal(isTaskDue(task, new Date("2026-12-07T06:00:00Z")), true);
    assert.equal(isTaskDue(task, new Date("2026-12-07T05:00:00Z")), false);
    assert.equal(isTaskDue({ ...task, timezone: "Mars/Olympus" }, new Date("2026-10-07T05:00:00Z")), false);
  });

  it("fires a scheduled task only once in the same minute", () => {
    const root = dir();
    const task: ScheduledTask = {
      id: "mailcow",
      text: "Проверь Mailcow",
      timezone: "Europe/Kyiv",
      cron: "39 4 * * *",
      status: "active",
      history: [],
    };
    const now = new Date("2026-10-07T01:39:20Z");
    saveTasks(root, [task]);
    let calls = 0;
    const run = () => {
      calls += 1;
      return { code: "OK" };
    };
    assert.equal(runDue(root, now, run).length, 1);
    assert.equal(runDue(root, new Date("2026-10-07T01:39:50Z"), run).length, 0);
    assert.equal(calls, 1);
  });
});
