import { createServerFn } from "@tanstack/react-start";

// Compatibility namespace for the audit page only. Tool execution and approval
// use /api/agent and /api/commands, with their session/CSRF/rate-limit gates.
export const listToolAudit = createServerFn({ method: "POST" }).handler(async () => {
  const { handleListAudit } = await import("./runtime.server.ts");
  return handleListAudit();
});
