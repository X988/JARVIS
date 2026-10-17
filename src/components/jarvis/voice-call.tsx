import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, MicOff, PhoneOff, Square } from "lucide-react";
import { postVoiceHear, postVoiceSpeak, postVoiceTurn } from "@/lib/jarvis/client-api";
import { useJarvis } from "@/lib/jarvis/store";
import { bargeIn, MIN_SPEECH_MS, PRE_ROLL_MS } from "@/lib/jarvis/voice/gate";
import {
  LISTEN_INITIAL,
  MAX_CLIENT_UTTERANCE_MS,
  SPEECH_RMS,
  concatFloats,
  limitVoiceSamples,
  downsampleAverage,
  encodeWavPcm16,
  rmsOf,
  stepListen,
  type ListenState,
} from "@/lib/jarvis/voice/endpoint";

import type { VoiceCallHandle } from "@/lib/jarvis/voice/call-handle";


type Phase = "listening" | "thinking" | "speaking";

const WORKLET = `
class JarvisCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("jarvis-capture", JarvisCapture);
`;


function confidenceLabel(value: number | null): string {
  if (value === null) return "";
  if (value >= 0.8) return "высокая";
  if (value >= 0.5) return "средняя";
  return "низкая";
}
function failText(code: string): string {
  if (code === "AUTH_REQUIRED") return "Нужна сессия. Войдите и повторите.";
  if (code === "ACTOR_DENIED") return "Эта учётка не оператор. Ничего не запускал.";
  if (code === "RATE_LIMIT") return "Слишком много фраз подряд. Подождите минуту.";
  if (code === "NOT_CONFIGURED") return "Распознавание на сервере не настроено.";
  if (code === "STT_FAILED") return "Не удалось распознать речь. Ничего не запускал.";
  return "Не удалось получить ответ.";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function VoiceCall({
  handle,
  approval,
  onClose,
}: {
  handle: VoiceCallHandle;
  approval: ReactNode;
  onClose: () => void;
}) {
  const showVoiceResult = useJarvis((state) => state.showVoiceResult);
  const [phase, setPhase] = useState<Phase>("listening");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState<string | null>(handle.error);
  const [elapsed, setElapsed] = useState(0);
  const [sentence, setSentence] = useState(0);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 12 }, () => 0.15));
  const [confidence, _setConfidence] = useState<number | null>(null);
  void confidenceLabel(confidence); // display helper
  const startedRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const controls = useRef({ interrupt: () => undefined, mute: () => undefined });
  const approvalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (approval) approvalRef.current?.scrollIntoView({ block: "nearest" });
  }, [approval]);

  useEffect(() => {
    if (phase !== "thinking") return;
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!handle.stream || !handle.context || handle.error) return;
    const context = handle.context;
    const stream = handle.stream;
    let stopped = false;
    let alive = true;
    let gen = 0;
    let listen: ListenState = LISTEN_INITIAL;
    let phaseNow: Phase = "listening";
    let uttered: Float32Array[] = [];
    let preroll: Float32Array[] = [];
    let prerollSamples = 0;
    let pending = new Float32Array(0);
    let hot: Float32Array[] = [];
    let bargeFrames: { rms: number }[] = [];
    let frameTick = 0;
    const mutedRef = { current: false };
    const hearAbort = { current: null as AbortController | null };
    const speakAbort = { current: null as AbortController | null };
    let sourceNode: AudioBufferSourceNode | null = null;
    const prerollMax = Math.round((16_000 * PRE_ROLL_MS) / 1000);
    const nativeFrame = Math.max(1, Math.round(context.sampleRate * 0.03));
    let wake: WakeLockSentinel | null = null;
    void navigator.wakeLock?.request("screen").then((lock) => {
      wake = lock;
    }).catch(() => undefined);

    function stopPlayback() {
      speakAbort.current?.abort();
      speakAbort.current = null;
      const node = sourceNode;
      sourceNode = null;
      if (!node) return;
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }

    function bump() {
      gen += 1;
      hearAbort.current?.abort();
      hearAbort.current = null;
      stopPlayback();
    }

    async function play(buffer: ArrayBuffer, ticket: number): Promise<void> {
      if (!alive || ticket !== gen) return;
      const audio = await context.decodeAudioData(buffer.slice(0));
      if (!alive || ticket !== gen) return;
      await new Promise<void>((resolve) => {
        const node = context.createBufferSource();
        sourceNode = node;
        node.buffer = audio;
        node.connect(context.destination);
        node.onended = () => {
          if (sourceNode === node) sourceNode = null;
          resolve();
        };
        node.start();
      });
    }

    async function consume(samples: Float32Array, ticket: number) {
      if (samples.length < Math.round((16_000 * MIN_SPEECH_MS) / 1000)) {
        if (ticket === gen) {
          phaseNow = "listening";
          if (alive) setPhase("listening");
        }
        return;
      }
      phaseNow = "thinking";
      startedRef.current = Date.now();
      if (alive) {
        setElapsed(0);
        setPhase("thinking");
        setNote(null);
        setSentence(0);
      }
      const hearCtrl = new AbortController();
      hearAbort.current = hearCtrl;
      try {
        const wav = encodeWavPcm16(samples, 16_000);
        const pcm = new ArrayBuffer(wav.byteLength);
        new Uint8Array(pcm).set(wav);
        const heard = await postVoiceHear(new Blob([pcm], { type: "audio/wav" }), hearCtrl.signal);
        if (!alive || ticket !== gen) return;
        if (heard.code !== "OK" || !heard.text) {
          setTranscript(heard.text || heard.raw || "");
          setNote(heard.message || failText(heard.code));
          phaseNow = "listening";
          setPhase("listening");
          return;
        }
        setTranscript(heard.text);
        const turn = await postVoiceTurn(heard.text, `voice-${crypto.randomUUID()}`, hearCtrl.signal);
        if (!alive || ticket !== gen) return;
        showVoiceResult(turn, heard.raw && heard.raw !== heard.text ? heard.raw : undefined);
        if (!turn.spoken) {
          setNote(failText(turn.code));
          phaseNow = "listening";
          setPhase("listening");
          return;
        }
        setReply(turn.spoken);
        if (!turn.tts || turn.sentences.length === 0) {
          setNote(turn.tts ? null : "Озвучка не настроена. Ответ показан текстом.");
          phaseNow = "listening";
          setPhase("listening");
          return;
        }
        phaseNow = "speaking";
        setPhase("speaking");
        setSentenceCount(turn.sentences.length);
        const speakCtrl = new AbortController();
        speakAbort.current = speakCtrl;
        let upcoming = postVoiceSpeak(turn.sentences[0], speakCtrl.signal);
        for (let index = 0; index < turn.sentences.length; index += 1) {
          if (!alive || ticket !== gen) return;
          const audio = await upcoming;
          if (!alive || ticket !== gen) return;
          if (!audio.ok) {
            setNote(audio.code === "NOT_CONFIGURED" ? "Озвучка не настроена. Ответ показан текстом." : "Не удалось озвучить ответ.");
            phaseNow = "listening";
            setPhase("listening");
            return;
          }
          upcoming = index + 1 < turn.sentences.length
            ? postVoiceSpeak(turn.sentences[index + 1], speakCtrl.signal)
            : Promise.resolve({ ok: false as const, code: "DONE" });
          setSentence(index + 1);
          await play(audio.audio, ticket);
        }
        if (alive && ticket === gen) {
          phaseNow = "listening";
          setPhase("listening");
        }
      } catch (error) {
        if (!alive || ticket !== gen || isAbort(error)) return;
        setNote("Не удалось обработать фразу. Ничего не запускал.");
        phaseNow = "listening";
        setPhase("listening");
      }
    }

    function onFrame(down: Float32Array, rms: number) {
      if (stopped || mutedRef.current) return;
      frameTick += 1;
      if (alive && frameTick % 3 === 0) {
        setLevels((current) => current.slice(1).concat(Math.max(0.08, Math.min(1, rms * 8))));
      }
      if (phaseNow !== "listening") {
        if (rms >= SPEECH_RMS) {
          hot.push(down);
          if (hot.length > 16) hot.shift();
        }
        bargeFrames.push({ rms });
        if (bargeFrames.length > 24) bargeFrames.shift();
        const floor = phaseNow === "speaking" ? 0.035 : 0.02;
        if (bargeIn(bargeFrames, floor)) {
          const seed = hot.map((chunk) => chunk.slice());
          hot = [];
          bargeFrames = [];
          bump();
          uttered = seed;
          preroll = [];
          prerollSamples = 0;
          listen = { phase: "speech", speechMs: MIN_SPEECH_MS, silenceMs: 0, utteranceMs: MIN_SPEECH_MS };
          phaseNow = "listening";
          if (alive) setPhase("listening");
        }
        return;
      }
      preroll.push(down);
      prerollSamples += down.length;
      while (prerollSamples > prerollMax && preroll.length > 1) {
        prerollSamples -= preroll[0].length;
        preroll.shift();
      }
      const stepped = stepListen(listen, rms, 30, { maxUtteranceMs: MAX_CLIENT_UTTERANCE_MS });
      listen = stepped.state;
      if (stepped.event === "start") {
        uttered = preroll.map((chunk) => chunk.slice());
        return;
      }
      if (listen.phase === "speech" && stepped.event === "none") {
        uttered.push(down);
        return;
      }
      if (stepped.event === "endpoint" || stepped.event === "max") {
        uttered.push(down);
        const pcm = limitVoiceSamples(concatFloats(uttered));
        uttered = [];
        preroll = [];
        prerollSamples = 0;
        listen = LISTEN_INITIAL;
        const ticket = gen;
        phaseNow = "thinking";
        void consume(pcm, ticket);
      }
    }

    function pushNative(chunk: Float32Array) {
      if (stopped) return;
      const next = new Float32Array(pending.length + chunk.length);
      next.set(pending, 0);
      next.set(chunk, pending.length);
      pending = next;
      while (pending.length >= nativeFrame) {
        const frame = pending.slice(0, nativeFrame);
        pending = pending.slice(nativeFrame);
        const down = context.sampleRate === 16_000 ? frame : downsampleAverage(frame, context.sampleRate, 16_000);
        onFrame(down, rmsOf(frame));
      }
    }

    controls.current.interrupt = () => {
      bump();
      uttered = [];
      hot = [];
      bargeFrames = [];
      preroll = [];
      prerollSamples = 0;
      listen = LISTEN_INITIAL;
      phaseNow = "listening";
      if (alive) setPhase("listening");
    };
    controls.current.mute = () => {
      mutedRef.current = !mutedRef.current;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !mutedRef.current;
      });
      if (mutedRef.current) {
        uttered = [];
        listen = LISTEN_INITIAL;
        bargeFrames = [];
        hot = [];
      }
      if (alive) setMuted(mutedRef.current);
    };

    const source = context.createMediaStreamSource(stream);
    const sink = context.createGain();
    sink.gain.value = 0;
    let processor: ScriptProcessorNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let closed = false;

    const attachProcessor = () => {
      processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        pushNative(event.inputBuffer.getChannelData(0).slice());
      };
      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);
    };

    // AudioWorklet may be unavailable or disabled by browser policy.
    // Always leave a ScriptProcessor fallback rather than a silent "listening" screen.
    if (!context.audioWorklet?.addModule) {
      attachProcessor();
    } else {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      try {
        void context.audioWorklet.addModule(url).then(() => {
          URL.revokeObjectURL(url);
          if (stopped || closed) return;
          worklet = new AudioWorkletNode(context, "jarvis-capture");
          worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (event.data) pushNative(event.data);
          };
          source.connect(worklet);
          worklet.connect(sink);
          sink.connect(context.destination);
        }).catch(() => {
          URL.revokeObjectURL(url);
          if (!stopped && !closed) attachProcessor();
        });
      } catch {
        URL.revokeObjectURL(url);
        if (!stopped && !closed) attachProcessor();
      }
    }

    return () => {
      stopped = true;
      alive = false;
      closed = true;
      bump();
      try {
        processor?.disconnect();
        worklet?.disconnect();
        source.disconnect();
        sink.disconnect();
      } catch {
        /* context may already be closed */
      }
      void wake?.release().catch(() => undefined);
    };
  }, [handle, showVoiceResult]);

  const label = handle.error
    ? "Микрофон недоступен"
    : muted && phase === "listening"
      ? "Микрофон выключен"
      : phase === "listening"
        ? "Слушаю"
        : phase === "thinking"
          ? "Думаю"
          : "Говорю";

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg text-fg" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-call-title"
        tabIndex={-1}
        className="call-pad flex min-h-0 flex-1 flex-col outline-none"
      >
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <p className="font-mono text-xs text-moss">РАЗГОВОР</p>
            <h2 id="voice-call-title" className="text-xl font-semibold tracking-tight">
              JARVIS
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted">
            <PhoneOff className="size-4" aria-hidden="true" />
            Выйти
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="flex flex-col items-center gap-4 py-2">
            <div
              className={
                "call-orb flex size-28 items-center justify-center rounded-full border-2 " +
                (phase === "thinking" ? "border-warn" : phase === "speaking" ? "border-paper" : "border-moss")
              }
              data-state={muted && phase === "listening" ? "muted" : phase}
            >
              <div className="flex h-8 items-end gap-1" aria-hidden="true">
                {levels.map((level, index) => (
                  <span
                    key={index}
                    className={"w-1 rounded-sm " + (phase === "thinking" ? "bg-warn" : "bg-moss")}
                    style={{ height: `${Math.max(4, Math.round(level * 32))}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="text-center" aria-live="polite">
              <p className="text-3xl font-semibold tracking-tight">{label}</p>
              {phase === "thinking" ? (
                <p className="mt-2 text-sm text-muted tabular-nums">Модель отвечает · {elapsed} с</p>
              ) : null}
              {phase === "speaking" && sentenceCount > 1 ? (
                <p className="mt-2 font-mono text-xs text-subtle tabular-nums">
                  фраза {sentence} из {sentenceCount}
                </p>
              ) : null}
            </div>
            {phase === "thinking" ? (
              <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                <div className="call-progress h-full w-1/3 rounded-full bg-warn" />
              </div>
            ) : null}
          </div>
          {transcript ? (
            <section className="rounded-xl border border-line bg-surface p-4">
              <p className="font-mono text-xs text-subtle">Вы сказали</p>
              <p className="mt-2 text-pretty text-sm">{transcript}</p>
            </section>
          ) : (
            <p className="text-pretty text-center text-sm text-muted">
              Говорите спокойно. После паузы я распознаю фразу, отвечу и снова буду слушать.
            </p>
          )}
          {reply ? (
            <section className="rounded-xl border border-line bg-elevated p-4">
              <p className="font-mono text-xs text-moss">JARVIS</p>
              <p className="mt-2 text-pretty text-sm">{reply}</p>
            </section>
          ) : null}
          {note ? <p className="text-pretty text-sm text-warn">{note}</p> : null}
          <p className="text-pretty text-sm text-subtle">
            Голос ничего не подтверждает и не выполняет. Опасная команда останется заявкой: фразу CONFIRM нужно ввести текстом.
          </p>
          {approval ? (
            <div ref={approvalRef}>{approval}</div>
          ) : null}
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => controls.current.interrupt()}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-paper px-3 text-sm font-medium text-ink"
          >
            <Square className="size-4" aria-hidden="true" />
            Прервать
          </button>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => controls.current.mute()}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm"
          >
            {muted ? <Mic className="size-4" aria-hidden="true" /> : <MicOff className="size-4" aria-hidden="true" />}
            {muted ? "Включить микрофон" : "Выключить микрофон"}
          </button>
        </footer>
      </div>
    </div>
  );
}
export type { VoiceCallHandle } from "@/lib/jarvis/voice/call-handle";
