import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { OPERATORS, evaluate } from "@/lib/jarvis/model";
import { appendAudit } from "@/lib/jarvis/audit-log";
import { mark } from "@/lib/jarvis/metrics";
import { takeToken } from "@/lib/jarvis/rate-limit";

export const Route = createFileRoute("/api/commands")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        mark("requests");
        const executionId = randomUUID();
        let body: { text?: unknown; operatorId?: unknown };
        try {
          body = (await request.json()) as { text?: unknown; operatorId?: unknown };
        } catch {
          mark("failed");
          return Response.json({ code: "SCHEMA_INVALID", verdict: "deny", executionId }, { status: 400 });
        }
        const operator = OPERATORS.find((item) => item.id === body.operatorId);
        if (!operator || typeof body.text !== "string") {
          mark("denied");
          return Response.json({ code: "IDENTITY_UNKNOWN", verdict: "deny", executionId }, { status: 403 });
        }
        if (!takeToken(`cmd:${operator.id}`, 30, 60_000)) {
          mark("denied");
          return Response.json({ code: "RATE_LIMIT", verdict: "deny", executionId }, { status: 429 });
        }
        const decision = evaluate(body.text, operator, new Date());
        if (decision.verdict === "deny") mark("denied");
        else if (decision.confirmation !== "none") mark("approvals");
        else mark("allowed");
        appendAudit({
          at: new Date().toISOString(),
          executionId,
          actor: operator.id,
          action: decision.normalized,
          verdict: decision.verdict,
        });
        return Response.json({ executionId, mode: "demo", verdict: decision.verdict, decision });
      },
    },
  },
});
