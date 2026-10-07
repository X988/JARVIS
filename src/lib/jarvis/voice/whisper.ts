import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hallucination, MAX_AUDIO_BYTES } from "./gate.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/jarvis_stt.py");

export type SttHit = {
  text: string;
  language: string;
  language_confidence?: number;
  confidence: number;
  duration_ms: number;
  segments?: number;
  provider: "faster-whisper";
  model: string;
  device: string;
};

export type SttFailure = {
  code:
    | "NOT_CONFIGURED"
    | "STT_FAILED"
    | "NO_SPEECH"
    | "AUDIO_TOO_LARGE"
    | "AUDIO_TOO_LONG"
    | "STT_LOW_CONFIDENCE";
};

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

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function transcribeWav(wavPath: string, env: NodeJS.ProcessEnv = process.env): SttHit | SttFailure {
  if ((env.JARVIS_STT_PROVIDER || "faster-whisper") !== "faster-whisper") return { code: "NOT_CONFIGURED" };
  const root = audioRoot(env);
  const resolved = path.resolve(wavPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return { code: "STT_FAILED" };
  if (!fs.existsSync(resolved)) return { code: "NOT_CONFIGURED" };
  if (fs.statSync(resolved).size > MAX_AUDIO_BYTES) return { code: "AUDIO_TOO_LARGE" };

  const model = env.JARVIS_STT_MODEL || "small";
  const timeout = bounded(env.JARVIS_STT_TIMEOUT_MS, 90_000, 5_000, 300_000);
  const python = env.JARVIS_PYTHON_BIN?.trim() || "python3";
  const run = spawnSync(python, [script, resolved], {
    encoding: "utf8",
    timeout,
    env: {
      ...process.env,
      ...env,
      JARVIS_STT_MODEL: model,
      JARVIS_STT_LANGUAGE: env.JARVIS_STT_LANGUAGE || "ru",
      JARVIS_STT_DEVICE: env.JARVIS_STT_DEVICE || "auto",
      JARVIS_MODEL_DIR: env.JARVIS_MODEL_DIR || path.join(process.cwd(), "models"),
    },
  });
  const error = run.error as NodeJS.ErrnoException | undefined;
  if (error?.code === "ETIMEDOUT") return { code: "STT_FAILED" };
  if (error?.code === "ENOENT" || !run.stdout?.trim()) return { code: "NOT_CONFIGURED" };

  let body: SttHit & { code?: string };
  try {
    body = JSON.parse(run.stdout) as SttHit & { code?: string };
  } catch {
    return { code: "STT_FAILED" };
  }
  if (body.code === "NOT_CONFIGURED" || body.code === "STT_FAILED") return { code: body.code };
  if (!body.text?.trim() || hallucination(body.text)) return { code: "NO_SPEECH" };
  if ((body.duration_ms ?? 0) > bounded(env.JARVIS_STT_MAX_MS, 30_000, 1_000, 60_000)) {
    return { code: "AUDIO_TOO_LONG" };
  }
  return {
    text: body.text.trim(),
    language: body.language || "ru",
    language_confidence: body.language_confidence ?? 0,
    confidence: body.confidence ?? 0,
    duration_ms: body.duration_ms ?? 0,
    segments: body.segments ?? 0,
    provider: "faster-whisper",
    model: body.model || model,
    device: body.device || "cpu",
  };
}

export function sttProbe(env: NodeJS.ProcessEnv = process.env): {
  provider: string;
  model: string;
  device: string;
  ready: boolean;
} {
  const provider = env.JARVIS_STT_PROVIDER || "";
  const model = env.JARVIS_STT_MODEL || "small";
  const device = env.JARVIS_STT_DEVICE || "auto";
  if (provider !== "faster-whisper") return { provider: provider || "unset", model, device, ready: false };
  const python = env.JARVIS_PYTHON_BIN?.trim() || "python3";
  const imported = spawnSync(python, ["-c", "import faster_whisper"], { timeout: 8_000 });
  const modelRoot = env.JARVIS_MODEL_DIR || path.join(process.cwd(), "models");
  const folder = path.join(modelRoot, "models--Systran--faster-whisper-" + model);
  const direct = path.resolve(modelRoot, model);
  return {
    provider,
    model,
    device,
    ready: imported.status === 0 && (fs.existsSync(folder) || fs.existsSync(direct)),
  };
}
