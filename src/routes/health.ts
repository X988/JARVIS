import { createFileRoute } from "@tanstack/react-router";

function mode(): "dry-run" | "mock" | "real" {
  const raw = process.env.EXECUTION_MODE;
  return raw === "mock" || raw === "real" ? raw : "dry-run";
}

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            ok: true,
            service: "jarvis",
            mode: mode(),
            uptimeSec: Math.floor(process.uptime()),
          },
          { status: 200, headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
