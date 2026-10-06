import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";
import { providersFromEnv } from "@/lib/jarvis/monitoring";

export const Route = createFileRoute("/ready")({
  server: {
    handlers: {
      GET: async () => {
        const extension = path.join(process.cwd(), "extensions", "JarvisDev", "Configuration.xml");
        const policy = true;
        const dump = fs.existsSync(extension);
        const live = providersFromEnv().filter((item) => item.mode === "live");
        const ok = policy && dump;
        return Response.json(
          {
            ok,
            mode: "demo",
            policy: policy ? "loaded" : "down",
            extensionDump: dump ? "present" : "missing",
            liveProviders: live.map((item) => item.id),
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});
