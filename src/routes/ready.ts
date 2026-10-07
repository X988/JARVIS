import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";
import { readiness } from "@/lib/jarvis/server/config.ts";
import { sttProbe } from "@/lib/jarvis/voice/whisper.ts";

export const Route = createFileRoute("/ready")({
  server: {
    handlers: {
      GET: async () => {
        const extension = path.join(process.cwd(), "extensions", "JarvisDev", "Configuration.xml");
        const report = readiness(process.env, { dumpPresent: fs.existsSync(extension) });
        const stt = sttProbe();
        const sttRequired = process.env.JARVIS_STT_PROVIDER === "faster-whisper";
        const ok = report.ok && (!sttRequired || stt.ready);
        return Response.json(
          {
            ok,
            profile: report.profile,
            problems: report.problems,
            adapters: report.adapters,
            stt,
            tts: { provider: process.env.JARVIS_TTS_PROVIDER || "unset", ready: false },
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});
