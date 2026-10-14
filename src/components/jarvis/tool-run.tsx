import type { PublicCall } from "@/lib/jarvis/tools/types";

const RESULT_LABEL: Record<PublicCall["result"], string> = {
  dry_run: "DRY RUN · не отправлялось",
  executed: "Выполнено",
  awaiting_approval: "Ждёт решения",
  approved_dry_run: "Approve · dry-run, не отправлялось",
  rejected: "Reject",
  denied: "Отказ политики",
  forbidden: "Нет права",
  error: "Ошибка",
};

function tone(result: PublicCall["result"]): string {
  if (result === "denied" || result === "error" || result === "forbidden") return "text-danger";
  if (result === "awaiting_approval" || result === "rejected") return "text-warn";
  return "text-moss";
}

export function ToolRunCard({
  calls,
  assistant,
  mode,
  canApprove,
  onDecide,
}: {
  calls: PublicCall[];
  assistant: string;
  mode: "dry-run" | "live";
  canApprove: boolean;
  onDecide: (approvalId: string, decision: "approve" | "reject") => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="font-mono text-xs text-subtle">
        инструменты · {mode}
        {mode === "dry-run" ? " · хосты не вызываются" : ""}
      </p>
      {calls.map((call) => (
        <section key={call.id} className="rounded-lg border border-line bg-bg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs text-paper">
              {call.tool} · {call.risk === "change" ? "change" : "read-only"} · {call.host}
            </p>
            <p className={`font-mono text-xs ${tone(call.result)}`}>{RESULT_LABEL[call.result]}</p>
          </div>
          <p className="mt-3 font-mono text-sm break-all text-paper" data-tool-command>
            {call.command}
          </p>
          {call.detail ? <p className="mt-2 text-pretty text-sm text-muted">{call.detail}</p> : null}
          {call.result === "awaiting_approval" && call.approvalId ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm">Точная команда выше. Изменение уходит только после Approve.</p>
              {canApprove ? null : (
                <p className="text-sm text-warn">Только operator или admin могут нажать Approve или Reject.</p>
              )}
              <div className="flex flex-wrap gap-2" data-approval-actions>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={() => onDecide(call.approvalId ?? "", "approve")}
                  className="min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={() => onDecide(call.approvalId ?? "", "reject")}
                  className="min-h-11 rounded-md border border-line px-3 text-sm text-danger disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ))}
      {assistant ? <p className="text-pretty text-sm">{assistant}</p> : null}
    </div>
  );
}
