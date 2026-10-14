import { processCommand } from "./pipeline.ts";

const [stateDir, approvalId, phrase, requestId, nowIso] = process.argv.slice(2);
const now = new Date(nowIso);
const result = processCommand({
  text: "Сделай резервную копию базы utp",
  requestId,
  session: {
    id: "sess-admin",
    accountId: "admin1",
    role: "operator",
    expiresAt: now.getTime() + 60_000,
    channel: "test",
  },
  now,
  stateDir,
  mode: "dry-run",
  approval: { id: approvalId, confirmation: phrase },
});
process.stdout.write(JSON.stringify({ code: result.code, called: result.executionCalled }));
