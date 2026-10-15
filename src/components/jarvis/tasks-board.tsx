import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ensureServerSession } from "@/lib/jarvis/client-api";

type TaskRow = {
  id: string;
  status: string;
  phase: string;
  progress: number;
  logs: string[];
  result: string | null;
  error: string | null;
  attempt: number;
  maxAttempts: number;
  tools: string[];
  model: string | null;
  memory: string[];
  conclusion: string | null;
  updatedAt: string;
};

type ApprovalRow = {
  id: string;
  runbook: string;
  target: string;
  expiresAt: number;
  stage: number;
};

function csrf(): string {
  const match = document.cookie.match(/(?:^|; )jarvis_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function loadBoard(): Promise<{ tasks: TaskRow[]; approvals: ApprovalRow[]; code: string }> {
  await ensureServerSession();
  const response = await fetch("/api/tasks", { credentials: "include" });
  const body = (await response.json()) as {
    code?: string;
    tasks?: TaskRow[];
    approvals?: ApprovalRow[];
  };
  return {
    code: body.code || (response.ok ? "OK" : "AUTH_REQUIRED"),
    tasks: body.tasks ?? [],
    approvals: body.approvals ?? [],
  };
}

async function postTask(action: string, extra: Record<string, string> = {}): Promise<{ code: string; report?: string }> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-jarvis-csrf": csrf() },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = (await response.json()) as { code?: string; report?: string };
  return { code: body.code || "SCHEMA_INVALID", report: body.report };
}

export function TasksBoard() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [code, setCode] = useState("…");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadBoard();
    setTasks(next.tasks);
    setApprovals(next.approvals);
    setCode(next.code);
  }, []);

  useEffect(() => {
    let alive = true;
    loadBoard().then((next) => {
      if (!alive) return;
      setTasks(next.tasks);
      setApprovals(next.approvals);
      setCode(next.code);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function act(action: "cancel" | "report" | "rerun", id: string) {
    const result = await postTask(action, { id });
    if (action === "report" && result.report) {
      const blob = new Blob([result.report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${id}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setNote("Отчёт собран из сохранённых полей. Секреты в него не входят.");
    } else if (result.code === "OK") {
      setNote(action === "cancel" ? "Задание остановлено." : "Повтор поставлен в очередь. Live-проба не запускалась.");
    } else {
      setNote(result.code);
    }
    await refresh();
  }

  const selected = tasks.find((item) => item.id === openId) ?? null;

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-line px-4 py-4">
        <p className="font-mono text-xs text-moss">TASKS</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Задания агента</h1>
          <Link to="/" className="inline-flex min-h-11 items-center font-mono text-xs text-muted">
            К консоли
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Очередь, этапы и заключения. Остановка не выполняет команду. Повтор доступен только для уже записанных read-only инструментов.
        </p>
      </header>
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex flex-col gap-3">
          <p className="font-mono text-xs text-subtle">Сессия: {code}</p>
          {note ? <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg">{note}</p> : null}
          {tasks.length === 0 ? (
            <p className="rounded-md border border-line px-4 py-6 text-sm text-muted">
              Активных и завершённых заданий для этой сессии нет.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => (
                <li key={task.id} className="rounded-md border border-line px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{task.id}</p>
                      <p className="mt-1 text-xs text-muted">
                        {task.status} · {task.phase} · {task.progress}% · попытка {task.attempt}/{task.maxAttempts}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => setOpenId(task.id)}>
                        Подробнее
                      </button>
                      <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => act("report", task.id)}>
                        Отчёт
                      </button>
                      <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => act("rerun", task.id)}>
                        Повтор
                      </button>
                      <button type="button" className="min-h-11 rounded-md bg-forest px-3 text-sm text-paper" onClick={() => act("cancel", task.id)}>
                        Стоп
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="flex flex-col gap-3">
          <section className="rounded-md border border-line p-3">
            <h2 className="text-sm font-semibold">Ожидают подтверждения</h2>
            {approvals.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Открытых заявок нет.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {approvals.map((item) => (
                  <li key={item.id} className="text-sm">
                    <span className="font-mono text-xs">{item.id}</span>
                    <span className="mt-1 block text-muted">
                      {item.runbook} · {item.target} · этап {item.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-md border border-line p-3">
            <h2 className="text-sm font-semibold">Карточка</h2>
            {selected ? (
              <dl className="mt-2 flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-xs text-subtle">Модель</dt>
                  <dd>{selected.model ?? "не выбиралась"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Инструменты</dt>
                  <dd className="break-words">{selected.tools.join(", ") || "нет"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Память</dt>
                  <dd className="break-words">{selected.memory.join("; ") || "нет"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Заключение</dt>
                  <dd>{selected.conclusion ?? selected.result ?? "нет"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Ошибка</dt>
                  <dd className="text-danger">{selected.error ?? "нет"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Журнал</dt>
                  <dd className="font-mono text-xs text-muted">{selected.logs.slice(-6).join(" · ") || "пусто"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Обновлено</dt>
                  <dd className="font-mono text-xs">{selected.updatedAt}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted">Выберите задание, чтобы увидеть этап, инструменты и источник заключения.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
