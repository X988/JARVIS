import { createFileRoute } from "@tanstack/react-router";
import { handleTasks } from "@/lib/jarvis/server/http.ts";

export const Route = createFileRoute("/api/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => handleTasks(request),
      POST: async ({ request }) => handleTasks(request),
    },
  },
});
