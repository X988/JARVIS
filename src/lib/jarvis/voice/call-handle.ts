

export type VoiceCallHandle = {
  stream: MediaStream | null;
  context: AudioContext | null;
  error: string | null;
  released: boolean;
};

export async function beginVoiceCall(): Promise<VoiceCallHandle> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, context: null, error: "Этот браузер не даёт доступ к микрофону.", released: false };
  }
  if (!window.isSecureContext) {
    return { stream: null, context: null, error: "Микрофон доступен только по HTTPS.", released: false };
  }
  let context: AudioContext | null = null;
  try {
    try {
      context = new AudioContext({ sampleRate: 16_000 });
    } catch {
      context = new AudioContext();
    }
    const resumed = context.resume();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "OverconstrainedError") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw error;
      }
    }
    await resumed;
    return { stream, context, error: null, released: false };
  } catch (error) {
    void context?.close().catch(() => undefined);
    return { stream: null, context: null, error: micError(error), released: false };
  }
}

export function releaseVoiceCall(handle: VoiceCallHandle | null): void {
  if (!handle || handle.released) return;
  handle.released = true;
  handle.stream?.getTracks().forEach((track) => track.stop());
  void handle.context?.close().catch(() => undefined);
}

function micError(error: unknown): string {
  if (!window.isSecureContext) return "Микрофон доступен только по HTTPS.";
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Нет доступа к микрофону. Разрешите запись в браузере и повторите.";
  if (name === "NotFoundError") return "Микрофон не найден.";
  if (name === "NotReadableError") return "Микрофон занят другим приложением.";
  return "Не удалось открыть микрофон.";
}
