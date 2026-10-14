import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramWebhook } from "@/lib/jarvis/plane/telegram-bot.ts";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => handleTelegramWebhook(request),
    },
  },
});
