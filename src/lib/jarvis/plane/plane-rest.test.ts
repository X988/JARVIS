import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runAgents } from "./agents.ts";
import { deliverArtifact } from "./artifacts.ts";
import { browserIntent } from "./browser.ts";
import { activateRunbook, proposeRunbook } from "./drafts.ts";
import { cancelJob, enqueue, planForBranch, prMayLandOnMain } from "./jobs.ts";
import { admitMcp } from "./mcp.ts";
import { loadPluginDir } from "./plugins.ts";
import { indexFolder, searchChunks } from "./rag.ts";
import { researchReport } from "./research.ts";
import { isTaskDue, runDue, saveTasks, type ScheduledTask } from "./scheduler.ts";
import { telegramContext } from "./telegram.ts";
import { recordUndo } from "./undo.ts";

function dir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-rest-"));
}

describe("remaining project ideas", () => {
  it("keeps telegram context out of the authorization decision", () => {
    assert.match(telegramContext({ updateId: 1, userId: 1, replyTo: "9", forwardedFromId: 4, documentName: "a.txt", imageFileId: "i", progress: "typing" }), /reply:9/);
  });

  it("refuses a secret and a path outside the outbox", () => {
    const root = dir();
    assert.equal(deliverArtifact({ root, relative: "../key.txt", bytes: 10, text: "ok" }).ok, false);
    assert.equal(deliverArtifact({ root, relative: "diff.patch", bytes: 20, text: "password=secret" }).ok, false);
    assert.equal(deliverArtifact({ root, relative: "diff.patch", bytes: 20, text: "только diff" }).ok, true);
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
    const found = searchChunks(indexFolder(root), "mailcow");
    assert.equal(found[0]?.source, "mail.md");
    assert.equal(researchReport("CVE", []).ok, false);
  });

  it("keeps agents, MCP and the browser behind the same deny", () => {
    assert.equal(runAgents("critic", ["опасно"]).mayExecute, false);
    assert.equal(admitMcp("unknown", ["docs.read"]).code, "DENY");
    assert.equal(admitMcp("docs.read", ["docs.read"]).code, "GATEWAY");
    assert.equal(browserIntent("login").code, "DENY");
    assert.equal(browserIntent("read").code, "READ");
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
    assert.equal(runDue(root, now, () => ({ code: (calls += 1) ? "OK" : "ERR" })).length, 1);
    assert.equal(runDue(root, new Date("2026-10-07T01:39:50Z"), () => ({ code: (calls += 1) ? "OK" : "ERR" })).length, 0);
    assert.equal(calls, 1);
  });
});
