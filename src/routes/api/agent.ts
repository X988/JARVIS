import { createFileRoute } from "@tanstack/react-router";
import { handleAgentCommand } from "@/lib/jarvis/server/http.ts";

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => handleAgentCommand(request),
    },
  },
});
