import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { listToolAudit } from "@/lib/jarvis/tools/api";
import type { AuditRecord } from "@/lib/jarvis/tools/types";
import { useJarvis } from "@/lib/jarvis/store";

export const Route = createFileRoute("/admin/audit")({
  component: AuditAdminPage,
});

function AuditAdminPage() {
  const operatorId = useJarvis((state) => state.operatorId);
  const auditEpoch = useJarvis((state) => state.auditEpoch);
  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setError(null);
    void listToolAudit({ data: { operatorId } })
      .then((result) => {
        if (cancel) return;
        setForbidden(result.forbidden);
        setRecords(result.records);
      })
      .catch(() => {
        if (!cancel) setError("Журнал сейчас не прочитался.");
      });
    return () => {
      cancel = true;
    };
  }, [operatorId, auditEpoch]);

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line px-4 py-4">
        <p className="font-mono text-xs text-moss">admin</p>
        <h1 className="text-xl font-semibold tracking-tight">Журнал инструментов</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm text-muted">
          Каждый вызов: кто, что, когда и чем закончилось. Пароли и ключи в журнал не пишутся. Approve доступен только
          ролям operator и admin.
        </p>
        <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-sm text-moss">
          К консоли
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {forbidden ? <p className="text-sm text-danger">Этот оператор не допущен к журналу.</p> : null}
        {records === null && !error ? <p className="text-sm text-muted">Читаю журнал…</p> : null}
        {records && records.length === 0 && !forbidden ? (
          <p className="text-sm text-muted">Пока нет вызовов. Команда в консоли оставит здесь строку.</p>
        ) : null}
        {records?.map((record) => (
          <article key={record.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-xs text-moss">
                {record.result} · {record.mode}
              </p>
              <time className="font-mono text-xs text-subtle" dateTime={record.at}>
                {record.at.replace("T", " ").replace(/\.\d{3}Z$/, "Z")}
              </time>
            </div>
            <p className="mt-3 font-mono text-sm break-all text-paper">{record.command}</p>
            <p className="mt-2 font-mono text-xs text-subtle">
              {record.actorName} · {record.role} · {record.tool} · {record.risk} · {record.host}
            </p>
            {record.approvalId ? <p className="font-mono text-xs text-warn">{record.approvalId}</p> : null}
            {record.detail ? <p className="mt-2 text-pretty text-sm text-muted">{record.detail}</p> : null}
          </article>
        ))}
      </div>
    </main>
  );
}
