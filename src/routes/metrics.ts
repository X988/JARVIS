import { createFileRoute } from "@tanstack/react-router";
import { snapshot } from "@/lib/jarvis/metrics";
import { providersFromEnv } from "@/lib/jarvis/monitoring";

export const Route = createFileRoute("/metrics")({
  server: {
    handlers: {
      GET: async () => {
        const live = providersFromEnv().filter((item) => item.mode === "live");
        return Response.json(
          snapshot({
            mode: "demo",
            onec: "file",
            live: live.length ? live.map((item) => item.id).join(",") : "none",
          }),
        );
      },
    },
  },
});
