import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hallucination, MAX_AUDIO_BYTES } from "./gate.ts";
import { encodeWavFromPcm16 } from "./endpoint.ts";

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
  // Blank keys from .env templates (`JARVIS_STT_MAX_MS=`) mean "unset", not 0.
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export type WarmState = {
  state: "cold" | "warming" | "warm" | "failed";
  at: number;
  ms?: number;
  detail?: string;
  pid?: number;
};

function sttEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
    JARVIS_STT_MODEL: env.JARVIS_STT_MODEL || "small",
    JARVIS_STT_LANGUAGE: env.JARVIS_STT_LANGUAGE || "ru",
    JARVIS_STT_DEVICE: env.JARVIS_STT_DEVICE || "auto",
    JARVIS_MODEL_DIR: env.JARVIS_MODEL_DIR || path.join(process.cwd(), "models"),
  };
}

function warmFile(env: NodeJS.ProcessEnv): string {
  return path.join(env.JARVIS_STATE_DIR?.trim() || path.join(process.cwd(), "data"), "stt-warm.json");
}

export function readWarmState(env: NodeJS.ProcessEnv = process.env): WarmState {
  try {
    const parsed = JSON.parse(fs.readFileSync(warmFile(env), "utf8")) as WarmState;
    return parsed && typeof parsed.state === "string" ? parsed : { state: "cold", at: 0 };
  } catch {
    return { state: "cold", at: 0 };
  }
}

function writeWarmState(env: NodeJS.ProcessEnv, state: WarmState): void {
  try {
    fs.mkdirSync(path.dirname(warmFile(env)), { recursive: true });
    fs.writeFileSync(warmFile(env), JSON.stringify({ ...state, pid: process.pid }));
  } catch {
    // Readiness falls back to "cold"; transcription itself is unaffected.
  }
}

let warming: Promise<WarmState> | null = null;

/**
 * Load the faster-whisper model once at service start by transcribing 1 s of
 * silence, so the first real voice turn does not pay model/CUDA load time.
 * Non-blocking; the result is persisted for /ready. JARVIS_STT_WARMUP=0 disables.
 */
export function startSttWarmup(env: NodeJS.ProcessEnv = process.env): Promise<WarmState> {
  if ((env.JARVIS_STT_PROVIDER || "faster-whisper") !== "faster-whisper" || env.JARVIS_STT_WARMUP === "0") {
    return Promise.resolve(readWarmState(env));
  }
  if (warming) return warming;
  const started = Date.now();
  writeWarmState(env, { state: "warming", at: started });
  const root = audioRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const wav = path.join(root, `warmup-${process.pid}-${started}.wav`);
  fs.writeFileSync(wav, encodeWavFromPcm16(new Int16Array(16_000), 16_000));
  const timeout = bounded(env.JARVIS_STT_WARMUP_TIMEOUT_MS, 180_000, 10_000, 600_000);
  const python = env.JARVIS_PYTHON_BIN?.trim() || "python3";
  warming = new Promise<WarmState>((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(python, [script, wav], { env: sttEnv(env), stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-400)));
    const finish = (state: WarmState) => {
      clearTimeout(timer);
      fs.rmSync(wav, { force: true });
      writeWarmState(env, state);
      warming = null;
      resolve(state);
    };
    child.on("error", (error) => finish({ state: "failed", at: Date.now(), detail: String(error.message).slice(0, 200) }));
    child.on("close", (code, signal) => {
      let body: { code?: string; detail?: string } | null = null;
      try {
        body = JSON.parse(stdout.trim() || "null");
      } catch {
        body = null;
      }
      const ok = code === 0 && body !== null && body.code !== "NOT_CONFIGURED" && body.code !== "STT_FAILED";
      finish(
        ok
          ? { state: "warm", at: Date.now(), ms: Date.now() - started }
          : {
              state: "failed",
              at: Date.now(),
              ms: Date.now() - started,
              detail: (signal ? `signal ${signal}` : body?.detail || stderr.trim().split("\n").at(-1) || `exit ${code}`).slice(0, 200),
            },
      );
    });
  });
  return warming;
}

function runStt(python: string, resolved: string, timeout: number, env: NodeJS.ProcessEnv) {
  return spawnSync(python, [script, resolved], { encoding: "utf8", timeout, env: sttEnv(env) });
}

export function transcribeWav(wavPath: string, env: NodeJS.ProcessEnv = process.env): SttHit | SttFailure {
  if ((env.JARVIS_STT_PROVIDER || "faster-whisper") !== "faster-whisper") return { code: "NOT_CONFIGURED" };
  const root = audioRoot(env);
  const resolved = path.resolve(wavPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return { code: "STT_FAILED" };
  if (!fs.existsSync(resolved)) return { code: "NOT_CONFIGURED" };
  if (fs.statSync(resolved).size > MAX_AUDIO_BYTES) return { code: "AUDIO_TOO_LARGE" };

  const model = env.JARVIS_STT_MODEL || "small";
  const configured = bounded(env.JARVIS_STT_TIMEOUT_MS, 90_000, 5_000, 300_000);
  // Until the model has been loaded once, allow for model/CUDA load time.
  const cold = readWarmState(env).state !== "warm";
  const timeout = cold ? Math.max(configured, 180_000) : configured;
  const python = env.JARVIS_PYTHON_BIN?.trim() || "python3";
  let run = runStt(python, resolved, timeout, env);
  // A crashed worker (empty stdout or killed by a signal) is retried once:
  // the first CUDA initialisation after a restart is the usual cause.
  // (A real timeout is not retried: that would double an already long wait.)
  const transient = (r: typeof run) => !r.error && (Boolean(r.signal) || !r.stdout?.trim());
  if (transient(run)) run = runStt(python, resolved, timeout, env);
  if (!transient(run) && run.stdout?.trim() && cold) writeWarmState(env, { state: "warm", at: Date.now() });
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
  const expectedLanguage = (env.JARVIS_STT_LANGUAGE || "ru").toLowerCase();
  const languageConfidence = body.language_confidence ?? 0;
  const languageMin = bounded(env.JARVIS_STT_LANGUAGE_MIN_CONFIDENCE, 0.55, 0.1, 0.95);
  if (
    expectedLanguage !== "auto" &&
    body.language &&
    body.language.toLowerCase() !== expectedLanguage &&
    languageConfidence >= languageMin
  ) {
    return { code: "STT_LOW_CONFIDENCE" };
  }
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

/** Any Hugging Face cache entry for the model, e.g. models--mobiuslabsgmbh--faster-whisper-large-v3-turbo. */
export function modelCached(modelRoot: string, model: string): boolean {
  try {
    return fs.readdirSync(modelRoot).some((name) => name.startsWith("models--") && name.endsWith(`--faster-whisper-${model}`));
  } catch {
    return false;
  }
}

export function sttProbe(env: NodeJS.ProcessEnv = process.env): {
  provider: string;
  model: string;
  device: string;
  ready: boolean;
  installed?: boolean;
  warm?: WarmState;
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
  const installed = imported.status === 0 && (fs.existsSync(folder) || fs.existsSync(direct) || modelCached(modelRoot, model));
  let warm = readWarmState(env);
  // Nothing warmed this process yet (e.g. production build without the Vite hook): start now.
  if (installed && (warm.state === "cold" || (warm.state !== "warming" && warm.pid !== process.pid))) {
    void startSttWarmup(env);
    warm = { state: "warming", at: Date.now() };
  }
  return {
    provider,
    model,
    device,
    ready: installed && warm.state === "warm",
    installed,
    warm,
  };
}
