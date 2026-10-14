import assert from "node:assert/strict";
import fs from "node:fs";
import { it } from "node:test";

it("keeps the legacy tool engine unreachable from the browser API", () => {
  const api = fs.readFileSync("src/lib/jarvis/tools/api.ts", "utf8");
  const runtime = fs.readFileSync("src/lib/jarvis/tools/runtime.server.ts", "utf8");
  const store = fs.readFileSync("src/lib/jarvis/store.ts", "utf8");
  assert.doesNotMatch(api, /handleRunTurn|handleDecide|runAssistantTurn|decideToolApproval/);
  assert.doesNotMatch(runtime, /ToolEngine|createSshExecutor|createMikrotikClient|DEMO_ACTORS|resolveActor/);
  assert.match(runtime, /authenticateRequest/);
  assert.doesNotMatch(store, /runAssistantTurn|operatorById|heuristicPlan/);
  assert.match(store, /postConversation/);
});
