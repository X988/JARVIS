import { createFileRoute } from "@tanstack/react-router";
import { handleVoice } from "@/lib/jarvis/voice/web.ts";

export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => handleVoice(request),
    },
  },
});
