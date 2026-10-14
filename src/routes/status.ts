import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";
import { componentStatus } from "@/lib/jarvis/server/components";
import { readiness } from "@/lib/jarvis/server/config";
import { executionMode } from "@/lib/jarvis/server/http";

export const Route = createFileRoute("/status")({
  server: {
    handlers: {
      GET: async () => {
        const dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data");
        const extension = path.join(process.cwd(), "extensions", "JarvisDev", "Configuration.xml");
        const report = readiness(process.env, {
          dumpPresent: fs.existsSync(extension),
          stateDir: dir,
        });
        const components = componentStatus(process.env);
        return Response.json(
          {
            ok: report.ok,
            profile: report.profile,
            mode: executionMode(),
            adapters: Object.fromEntries(
              Object.entries(report.probes).map(([id, probe]) => [id, probe.status]),
            ),
            components: Object.fromEntries(
              Object.entries(components).map(([id, component]) => [id, component.state]),
            ),
          },
          { status: report.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
