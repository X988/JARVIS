import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";
import { providersFromEnv } from "@/lib/jarvis/monitoring";
import { sttProbe } from "@/lib/jarvis/voice/whisper.ts";

export const Route = createFileRoute("/ready")({
  server: {
    handlers: {
      GET: async () => {
        const extension = path.join(process.cwd(), "extensions", "JarvisDev", "Configuration.xml");
        const policy = true;
        const dump = fs.existsSync(extension);
        const live = providersFromEnv().filter((item) => item.mode === "live");
        const stt = sttProbe();
        const sttRequired = process.env.JARVIS_STT_PROVIDER === "faster-whisper";
        const ok = policy && dump && (!sttRequired || stt.ready);
        return Response.json(
          {
            ok,
            mode: "demo",
            policy: policy ? "loaded" : "down",
            extensionDump: dump ? "present" : "missing",
            liveProviders: live.map((item) => item.id),
            stt,
            tts: {
              provider: process.env.JARVIS_TTS_PROVIDER || "unset",
              voice: process.env.JARVIS_TTS_VOICE || "",
              device: process.env.JARVIS_TTS_DEVICE || "cpu",
              ready: false,
            },
            telegram: { ready: Boolean(process.env.JARVIS_TELEGRAM_IDS && process.env.TELEGRAM_BOT_TOKEN) },
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});
