import { createFileRoute } from "@tanstack/react-router";
import { handleCommand } from "@/lib/jarvis/server/http.ts";

export const Route = createFileRoute("/api/commands")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCommand(request),
    },
  },
});
