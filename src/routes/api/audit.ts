import { createFileRoute } from "@tanstack/react-router";
import { handleAuditList } from "@/lib/jarvis/server/http.ts";

export const Route = createFileRoute("/api/audit")({
  server: { handlers: { GET: async ({ request }) => handleAuditList(request) } },
});
