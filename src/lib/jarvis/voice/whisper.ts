import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hallucination, MAX_AUDIO_BYTES } from "./gate.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_stt.py");

export type SttHit = {
  text: string;
  language: string;
  confidence: number;
  duration_ms: number;
  provider: "faster-whisper";
  model: string;
  device: string;
};

export type SttFailure = { code: "NOT_CONFIGURED" | "STT_FAILED" | "NO_SPEECH" | "AUDIO_TOO_LARGE" | "AUDIO_TOO_LONG" | "STT_LOW_CONFIDENCE" };

export function audioRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.JARVIS_AUDIO_DIR || path.join(osTmp(), "jarvis-audio"));
}

function osTmp(): string {
  return process.env.TMPDIR || "/tmp";
}

export function safeAudioFile(root: string, leaf: string): string | null {
  if (!/^[a-zA-Z0-9._-]+$/.test(leaf)) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, leaf);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

export function sweepAudio(root: string, olderThanMs: number, now = Date.now()): number {
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const full = safeAudioFile(root, name);
    if (!full || !fs.statSync(full).isFile()) continue;
    if (now - fs.statSync(full).mtimeMs < olderThanMs) continue;
    fs.unlinkSync(full);
    removed += 1;
  }
  return removed;
}

export function transcribeWav(wavPath: string, env: NodeJS.ProcessEnv = process.env): SttHit | SttFailure {
  const root = audioRoot(env);
  const resolved = path.resolve(wavPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return { code: "STT_FAILED" };
  if (!fs.existsSync(resolved)) return { code: "NOT_CONFIGURED" };
  if (fs.statSync(resolved).size > MAX_AUDIO_BYTES) return { code: "AUDIO_TOO_LARGE" };
  const model = env.JARVIS_STT_MODEL || "small";
  const run = spawnSync("python3", [script, resolved], {
    encoding: "utf8",
    timeout: Number(env.JARVIS_STT_TIMEOUT_MS || 90_000),
    env: {
      ...process.env,
      JARVIS_STT_MODEL: model,
      JARVIS_STT_LANGUAGE: env.JARVIS_STT_LANGUAGE || "ru",
      JARVIS_STT_DEVICE: env.JARVIS_STT_DEVICE || "auto",
      JARVIS_MODEL_DIR: env.JARVIS_MODEL_DIR || path.join(process.cwd(), "models"),
    },
  });
  if (run.error || !run.stdout?.trim()) return { code: "NOT_CONFIGURED" };
  let body: SttHit & { code?: string };
  try {
    body = JSON.parse(run.stdout) as SttHit & { code?: string };
  } catch {
    return { code: "STT_FAILED" };
  }
  if (body.code === "NOT_CONFIGURED" || body.code === "STT_FAILED") return { code: body.code };
  if (!body.text?.trim() || hallucination(body.text)) return { code: "NO_SPEECH" };
  if ((body.duration_ms ?? 0) > Number(env.JARVIS_STT_MAX_MS || 30_000)) return { code: "AUDIO_TOO_LONG" };
  return {
    text: body.text.trim(),
    language: body.language || "ru",
    confidence: body.confidence ?? 0,
    duration_ms: body.duration_ms ?? 0,
    provider: "faster-whisper",
    model: body.model || model,
    device: body.device || "cpu",
  };
}

export function sttProbe(env: NodeJS.ProcessEnv = process.env): { provider: string; model: string; device: string; ready: boolean } {
  const provider = env.JARVIS_STT_PROVIDER || "";
  const model = env.JARVIS_STT_MODEL || "small";
  const device = env.JARVIS_STT_DEVICE || "auto";
  if (provider !== "faster-whisper") return { provider: provider || "unset", model, device, ready: false };
  const imported = spawnSync("python3", ["-c", "import faster_whisper"], { timeout: 8_000 });
  const folder = path.join(env.JARVIS_MODEL_DIR || path.join(process.cwd(), "models"), `models--Systran--faster-whisper-${model}`);
  return { provider, model, device, ready: imported.status === 0 && fs.existsSync(folder) };
}
