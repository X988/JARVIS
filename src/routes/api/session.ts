import { createFileRoute } from "@tanstack/react-router";
import { handleSession } from "@/lib/jarvis/server/http.ts";

export const Route = createFileRoute("/api/session")({
  server: { handlers: { GET: async ({ request }) => handleSession(request) } },
});
