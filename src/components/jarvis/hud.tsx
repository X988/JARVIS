import type { ReactNode } from "react";
import { Mic, MicOff, PhoneOff, Shield, Clock, Activity } from "lucide-react";

export type HudPhase = "idle" | "listening" | "thinking" | "speaking";

export type EffectiveModeInfo = {
  mode: "dry-run" | "mock" | "real";
  requested: "dry-run" | "mock" | "real";
  degraded: boolean;
  reasons: string[];
};

type Props = {
  phase: HudPhase;
  modeInfo: EffectiveModeInfo | null;
  approvalExpiresAt?: number | null;
  levels?: number[];
  transcript?: string | null;
  confidence?: number | null;
  onClose?: () => void;
  children?: ReactNode;
};

function phaseText(phase: HudPhase): string {
  if (phase === "listening") return "Слушаю";
  if (phase === "thinking") return "Обрабатываю";
  if (phase === "speaking") return "Отвечаю";
  return "Ожидание";
}

// Показывает эффективный режим. При деградации: «Запрошен X, работает Y: причина».
function modeLabel(info: EffectiveModeInfo): string {
  if (!info.degraded) {
    if (info.mode === "real") return "Режим: real";
    if (info.mode === "mock") return "Режим: mock";
    return "Режим: dry-run";
  }
  const reason = info.reasons[0] ?? "проблемы конфигурации";
  return `Запрошен ${info.requested}, работает ${info.mode}: ${reason}`;
}

function confidenceText(value: number | null | undefined): string {
  if (value == null) return "";
  if (value >= 0.8) return "уверенность высокая";
  if (value >= 0.5) return "уверенность средняя";
  return "уверенность низкая";
}

export function Hud({
  phase,
  modeInfo,
  approvalExpiresAt,
  levels,
  transcript,
  confidence,
  onClose,
  children,
}: Props) {
  const left = approvalExpiresAt ? Math.max(0, Math.round((approvalExpiresAt - Date.now()) / 1000)) : null;
  const conf = confidenceText(confidence);

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-900/90 p-4 text-stone-100 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {phase === "listening" ? (
            <Mic className="h-5 w-5 text-emerald-400" />
          ) : phase === "thinking" ? (
            <Activity className="h-5 w-5 text-amber-400" />
          ) : (
            <MicOff className="h-5 w-5 text-stone-400" />
          )}
          <div>
            <div className="text-sm font-medium">{phaseText(phase)}</div>
            <div className="text-[11px] text-stone-400">{phase}</div>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-stone-800" aria-label="Закрыть">
            <PhoneOff className="h-4 w-4" />
          </button>
        )}
      </div>

      {modeInfo && (
        <div className="mt-3 flex items-start gap-2 text-xs">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
          <span className={modeInfo.degraded ? "text-amber-300" : "text-stone-300"}>{modeLabel(modeInfo)}</span>
        </div>
      )}

      {left !== null && (
        <div className="mt-1 flex items-center gap-2 text-xs text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          <span>Подтверждение: осталось {left} с</span>
        </div>
      )}

      {transcript && (
        <p className="mt-2 line-clamp-2 text-xs text-stone-200">«{transcript}»</p>
      )}

      {conf && <p className="mt-1 text-[11px] text-stone-400">{conf}</p>}

      {levels && levels.length > 0 && (
        <div className="mt-3 flex h-8 items-end gap-0.5" aria-hidden>
          {levels.map((v, i) => (
            <div
              key={i}
              className="w-1 rounded-sm bg-emerald-500/80"
              style={{ height: `${Math.max(4, Math.min(32, v * 32))}px` }}
            />
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
