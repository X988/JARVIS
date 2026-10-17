import type { ReactNode } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

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
  onClose?: () => void;
  children?: ReactNode;
};

function modeLabel(info: EffectiveModeInfo): string {
  if (!info.degraded) {
    if (info.mode === "real") return "Режим: real";
    if (info.mode === "mock") return "Режим: mock";
    return "Режим: dry-run";
  }
  const reason = info.reasons[0] ?? "проблемы конфигурации";
  return `Запрошен ${info.requested}, работает ${info.mode}: ${reason}`;
}

export function Hud({ phase, modeInfo, approvalExpiresAt, levels, onClose, children }: Props) {
  const left = approvalExpiresAt ? Math.max(0, Math.round((approvalExpiresAt - Date.now()) / 1000)) : null;

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-900/80 p-4 text-stone-100 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {phase === "listening" ? <Mic className="h-5 w-5 text-emerald-400" /> : <MicOff className="h-5 w-5 text-stone-400" />}
          <span className="text-sm font-medium capitalize">{phase}</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-stone-800" aria-label="Закрыть">
            <PhoneOff className="h-4 w-4" />
          </button>
        )}
      </div>

      {modeInfo && (
        <p className="mt-2 text-xs text-stone-300">{modeLabel(modeInfo)}</p>
      )}

      {left !== null && (
        <p className="mt-1 text-xs text-amber-300">Подтверждение: осталось {left} с</p>
      )}

      {levels && levels.length > 0 && (
        <div className="mt-3 flex h-8 items-end gap-0.5">
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
