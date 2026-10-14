import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RunInput = z.object({
  message: z.string().trim().min(1).max(2000),
  operatorId: z.string().trim().min(1).max(64),
});

const DecideInput = z.object({
  approvalId: z.string().trim().min(1).max(80),
  decision: z.enum(["approve", "reject"]),
  operatorId: z.string().trim().min(1).max(64),
});

const AuditInput = z.object({
  operatorId: z.string().trim().min(1).max(64),
});

export const getToolStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { handleStatus } = await import("./runtime.server.ts");
  return handleStatus();
});

export const runAssistantTurn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data }) => {
    const { handleRunTurn } = await import("./runtime.server.ts");
    return handleRunTurn(data);
  });

export const decideToolApproval = createServerFn({ method: "POST" })
  .validator((data: unknown) => DecideInput.parse(data))
  .handler(async ({ data }) => {
    const { handleDecide } = await import("./runtime.server.ts");
    return handleDecide(data);
  });

export const listToolAudit = createServerFn({ method: "POST" })
  .validator((data: unknown) => AuditInput.parse(data))
  .handler(async ({ data }) => {
    const { handleListAudit } = await import("./runtime.server.ts");
    return handleListAudit(data.operatorId);
  });
