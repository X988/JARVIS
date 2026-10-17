/**
 * Optional untrusted screen capture.
 * Result is only an input to the existing pipeline (agent/voice).
 * Never an authority source. Disabled by default.
 */

export type ScreenCaptureResult = {
  ok: boolean;
  dataUrl?: string;
  error?: string;
};

const FLAG = "JARVIS_SCREEN_CAPTURE_ENABLED";

export function screenCaptureEnabled(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): boolean {
  return env[FLAG] === "1" || env[FLAG] === "true";
}

export async function captureScreen(): Promise<ScreenCaptureResult> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, error: "Захват экрана недоступен в этом браузере." };
  }
  // Client-side flag check is best-effort; server must re-check.
  if (!screenCaptureEnabled()) {
    return { ok: false, error: "Захват экрана отключён (JARVIS_SCREEN_CAPTURE_ENABLED)." };
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, error: "Не удалось получить видеодорожку." };
    }
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 1280, 1280);
    canvas.height = Math.min(video.videoHeight || 720, 720);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, error: "Не удалось создать canvas." };
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true, dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка захвата";
    return { ok: false, error: msg };
  }
}
