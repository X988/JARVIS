import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, KeyRound, MessageSquare, Mic, ScrollText, Server, Square, X } from "lucide-react";
import {
  ACCOUNTS,
  OPERATORS,
  RISK_LABEL,
  RUNBOOKS,
  SERVERS,
  SERVICES,
  SUGGESTIONS,
  VOICE_PRESETS,
  formatClock,
  formatLeft,
  type Finding,
  type Risk,
} from "@/lib/jarvis/model";
import { alternativesFrom, interpretSpeech, type RawResult, type SpeechAlt, type SpeechReading } from "@/lib/jarvis/hearing";
import { useJarvis, type Phase, type Turn } from "@/lib/jarvis/store";

type SideTab = "site" | "audit" | "access";

const STEP_TEXT = ["Приём", "Намерение", "Политика", "Решение"] as const;
const STEP_VOICE = ["Whisper", "Намерение", "Политика", "Решение"] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<RawResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function createRecognizer(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "ru-RU";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  return rec;
}

function voiceNoteText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Нет доступа к микрофону. Разрешите запись и повторите.";
  if (code === "audio-capture") return "Микрофон не найден.";
  if (code === "network") return "Распознавание сейчас недоступно. Можно выбрать пример фразы.";
  if (code === "no-speech") return "Речь не разобрана. Скажите ещё раз или выберите пример.";
  if (code === "unsupported") return "Этот браузер не распознаёт речь. Ниже те же команды, как голосовое из Telegram.";
  return "Не удалось распознать. Повторите или выберите пример.";
}

function riskClass(risk: Risk): string {
  if (risk === 0) return "bg-forest text-paper";
  if (risk === 3) return "bg-danger-deep text-paper";
  if (risk === 2) return "text-warn";
  return "text-fg";
}

function RiskBadge({ risk }: { risk: Risk }) {
  const solid = risk === 0 || risk === 3;
  return (
    <span
      className={
        "inline-flex min-h-6 items-center rounded-sm px-2 font-mono text-xs " +
        (solid ? riskClass(risk) : `border border-line ${riskClass(risk)}`)
      }
    >
      L{risk} · {RISK_LABEL[risk]}
    </span>
  );
}

function dotClass(state: Finding["state"]): string {
  if (state === "ok") return "bg-moss";
  if (state === "warn") return "bg-warn";
  if (state === "bad") return "bg-danger";
  return "bg-subtle";
}

function stamp(turn: Turn): string {
  if (turn.phase === "running") return "Разбор";
  if (turn.phase === "awaiting") return "Ждёт фразу";
  if (turn.phase === "expired") return "Срок истёк";
  if (turn.phase === "cancelled") return "Отменено";
  if (turn.decision.verdict === "deny") return "Отказ";
  if (turn.decision.verdict === "clarify") return "Без действия";
  if (turn.dryRun && turn.decision.mutation) return "DRY RUN · не выполнялось";
  if (turn.dryRun) return "DRY RUN · чтение";
  if (turn.executed) return "Симуляция шаблона";
  return "Готово";
}

function phaseTone(phase: Phase, verdict: Turn["decision"]["verdict"]): string {
  if (phase === "denied" || verdict === "deny") return "text-danger";
  if (phase === "awaiting" || phase === "expired" || verdict === "clarify") return "text-warn";
  if (phase === "cancelled") return "text-subtle";
  return "text-moss";
}

function Wave() {
  return (
    <div className="flex h-8 items-center gap-1" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className="wave-bar h-6 w-1 rounded-sm bg-moss"
          style={{ animationDelay: `${index * 60}ms` }}
        />
      ))}
    </div>
  );
}

function Findings({ items }: { items: Finding[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label} className="flex gap-3">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dotClass(item.state)}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-pretty text-sm text-muted">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ApprovalBox({ turn, now }: { turn: Turn; now: number }) {
  const [value, setValue] = useState("");
  const reply = useJarvis((state) => state.reply);
  const cancel = useJarvis((state) => state.cancel);
  const approval = turn.approval;
  if (!approval || turn.phase !== "awaiting") return null;
  const stages = turn.decision.confirmation === "double" ? 2 : 1;
  const left = now > 0 ? formatLeft(approval.expiresAt - now) : "5:00";
  const ready = value.trim() === approval.phrase;
  return (
    <div className="mt-4 rounded-sm border border-line bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">Подтверждение</p>
        <p className="font-mono text-xs text-warn tabular-nums">
          этап {approval.stage}/{stages} · {left}
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
        {turn.decision.consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm">Введите фразу целиком. «Да» не подойдёт.</p>
      <p className="mt-2 break-all font-mono text-sm text-paper">{approval.phrase}</p>
      <div className="mt-3 flex flex-col gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Фраза подтверждения"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-11 w-full rounded-sm border border-line bg-surface px-3 font-mono text-sm text-fg"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setValue(approval.phrase)}
            className="min-h-11 rounded-sm border border-line px-3 text-sm"
          >
            Вставить фразу
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => reply(turn.id, value)}
            className="min-h-11 rounded-sm bg-paper px-3 text-sm font-medium text-ink disabled:opacity-40"
          >
            Подтвердить
          </button>
          <button
            type="button"
            onClick={() => cancel(turn.id)}
            className="min-h-11 rounded-sm px-3 text-sm text-muted"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function TurnCard({ turn, now }: { turn: Turn; now: number }) {
  const labels = turn.source === "voice" ? STEP_VOICE : STEP_TEXT;
  const book = RUNBOOKS.find((item) => item.id === turn.decision.runbook);
  return (
    <article className="turn-in rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge risk={turn.decision.risk} />
        <p className={`font-mono text-xs ${phaseTone(turn.phase, turn.decision.verdict)}`}>{stamp(turn)}</p>
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-balance">{turn.decision.title}</h2>
      {turn.decision.reason ? <p className="mt-2 text-pretty text-sm text-fg">{turn.decision.reason}</p> : null}
      <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {labels.map((label, index) => (
          <li
            key={label}
            className={`font-mono text-xs ${index < turn.step ? "text-moss" : "text-subtle"}`}
          >
            {index + 1} {label}
          </li>
        ))}
      </ol>
      <p className="mt-4 font-mono text-sm break-all text-paper">{turn.decision.toolCall}</p>
      {turn.decision.parameters.length > 0 ? (
        <p className="mt-2 font-mono text-xs text-subtle">
          {turn.decision.parameters.map((item) => `${item.key}=${item.value}`).join(" · ")}
        </p>
      ) : null}
      <ol className="mt-4 flex list-decimal flex-col gap-1 pl-4 text-sm text-muted">
        {turn.decision.plan.map((line) => (
          <li key={line} className="text-pretty">
            {line}
          </li>
        ))}
      </ol>
      {turn.decision.mutation && !turn.showFindings && turn.decision.verdict === "allow" && turn.phase !== "awaiting" ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-muted">
          {turn.decision.consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {book ? (
        <p className="mt-3 text-sm text-muted">
          Runbook {book.title}. Исполнитель: {book.executor}. Таймаут: {book.timeout}. Откат: {book.rollback}.
        </p>
      ) : null}
      {turn.showFindings ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="font-mono text-xs text-subtle">Отчёт шаблона, не живой опрос</p>
          <Findings items={turn.decision.findings} />
        </div>
      ) : null}
      {turn.hint ? <p className="mt-3 text-sm text-warn">{turn.hint}</p> : null}
      {turn.replies.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {turn.replies.map((line, index) => (
            <li key={`${line}-${index}`} className="font-mono text-xs break-all text-subtle">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <ApprovalBox key={turn.approval?.phrase ?? "none"} turn={turn} now={now} />
      {turn.phase !== "running" && turn.phase !== "awaiting" && turn.decision.recommendation ? (
        <p className="mt-4 text-pretty text-sm">{turn.decision.recommendation}</p>
      ) : null}
      <details className="mt-4">
        <summary className="text-sm text-muted">След политики</summary>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs text-subtle">
          {turn.decision.policyNotes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      {turn.durationMs != null ? (
        <p className="mt-3 font-mono text-xs text-subtle tabular-nums">
          {turn.exitCode === null ? "без кода" : `код ${turn.exitCode}`} · {(turn.durationMs / 1000).toFixed(1)} с
        </p>
      ) : null}
    </article>
  );
}

function SitePanel() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-medium">Серверы</h2>
        <p className="mt-1 text-sm text-muted">Не в коде агента, а в inventory. Демо-набор.</p>
        <ul className="mt-3 flex flex-col">
          {SERVERS.map((server) => (
            <li key={server.id} className="border-t border-line py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-sm">{server.id}</p>
                <p className="text-xs text-subtle">{server.type}</p>
              </div>
              <p className="mt-1 text-sm text-muted">{server.roles.join(" · ")}</p>
              <p className="text-sm text-subtle">{server.note}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium">Runbooks</h2>
        <div className="mt-2">
          {RUNBOOKS.map((book) => (
            <details key={book.id} className="border-t border-line">
              <summary className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="text-sm">{book.title}</span>
                <RiskBadge risk={book.risk} />
              </summary>
              <div className="flex flex-col gap-1 pb-3 text-sm text-muted">
                <p className="text-pretty">{book.description}</p>
                <p>Входы: {book.inputs}</p>
                <p>Проверка: {book.validation}</p>
                <p>Цели: {book.targets}</p>
                <p>Исполнитель: {book.executor}</p>
                <p>Таймаут: {book.timeout}</p>
                <p>Откат: {book.rollback}</p>
                <p>Верификация: {book.verification}</p>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuditPanel() {
  const audit = useJarvis((state) => state.audit);
  if (audit.length === 0) {
    return <p className="text-sm text-muted">Журнал пуст. Каждая команда оставит след без секретов.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {audit.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-xs text-moss">{entry.result}</p>
            <p className="font-mono text-xs text-subtle tabular-nums">{formatClock(entry.at)}</p>
          </div>
          <p className="mt-2 text-sm text-pretty">{entry.request}</p>
          <p className="mt-2 font-mono text-xs text-subtle">
            {entry.user} · {entry.source} · {entry.intent}
          </p>
          <p className="font-mono text-xs text-subtle">
            {entry.tool} · {entry.target} · L{entry.risk}
          </p>
          <p className="font-mono text-xs break-all text-subtle">{entry.parameters}</p>
          {entry.approvalId ? <p className="font-mono text-xs text-warn">{entry.approvalId}</p> : null}
          {entry.error ? <p className="mt-1 text-sm text-danger">{entry.error}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function AccessPanel() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-medium">Уровни</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          <li>L0 чтение — сразу. Логи, место, CI, маршруты.</li>
          <li>L1 низкий — сразу. Backup по шаблону.</li>
          <li>L2 изменение — фраза CONFIRM и номер заявки, 5 минут.</li>
          <li>L3 критический — две фразы. Ребут DC, firewall, удаление.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium">Учётки</h2>
        <p className="mt-1 text-sm text-muted">Одной всемогущей записи нет. Паролей в консоли нет.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {ACCOUNTS.map((account) => (
            <li key={account.id}>
              <p className="font-mono text-sm">{account.id}</p>
              <p className="text-sm text-muted">{account.scope}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium">Контур</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {SERVICES.map((service) => (
            <li key={service.name} className="flex items-center justify-between gap-3 text-sm">
              <span>{service.name}</span>
              <span className="font-mono text-xs text-subtle">{service.state}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-pretty text-sm text-muted">
          Это модель. PostgreSQL, Redis, Whisper и Semaphore здесь не запущены и к вашей сети не подключены.
        </p>
      </section>
    </div>
  );
}

function Side({ tab }: { tab: SideTab }) {
  if (tab === "audit") return <AuditPanel />;
  if (tab === "access") return <AccessPanel />;
  return <SitePanel />;
}

const SIDE: { id: SideTab; label: string }[] = [
  { id: "site", label: "Среда" },
  { id: "audit", label: "Журнал" },
  { id: "access", label: "Доступ" },
];

export function Console() {
  const turns = useJarvis((state) => state.turns);
  const now = useJarvis((state) => state.now);
  const busy = useJarvis((state) => state.busy);
  const dryRun = useJarvis((state) => state.dryRun);
  const operatorId = useJarvis((state) => state.operatorId);
  const setDryRun = useJarvis((state) => state.setDryRun);
  const setOperator = useJarvis((state) => state.setOperator);
  const submit = useJarvis((state) => state.submit);
  const tick = useJarvis((state) => state.tick);
  const [draft, setDraft] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [hearing, setHearing] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [review, setReview] = useState<SpeechReading | null>(null);
  const [mobile, setMobile] = useState<"dialog" | SideTab>("dialog");
  const [panel, setPanel] = useState<SideTab>("site");
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const pendingRef = useRef("");
  const cancelRef = useRef(false);
  const voiceBusy = useRef(false);
  const silenceRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);
  const candidatesRef = useRef<SpeechAlt[]>([]);
  const locked = busy || hearing !== null || listening;
  const stranger = operatorId !== "admin1";

  useEffect(() => {
    const id = window.setInterval(() => tick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, hearing]);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (silenceRef.current) window.clearTimeout(silenceRef.current);
      if (limitRef.current) window.clearTimeout(limitRef.current);
      recRef.current?.abort();
    };
  }, []);

  async function send(text: string, source: "text" | "voice") {
    const value = text.trim();
    if (!value || locked) return;
    if (source === "text") setDraft("");
    await submit(value, source);
  }

  function clearListenTimers() {
    if (silenceRef.current) window.clearTimeout(silenceRef.current);
    if (limitRef.current) window.clearTimeout(limitRef.current);
    silenceRef.current = null;
    limitRef.current = null;
  }

  async function acceptVoice(text: string, heard?: string) {
    const value = text.trim();
    if (!value || voiceBusy.current) return;
    voiceBusy.current = true;
    setVoiceOpen(false);
    setLive("");
    setVoiceNote(null);
    setReview(null);
    setMobile("dialog");
    setHearing(value);
    try {
      await sleep(700);
      setHearing(null);
      await submit(value, "voice", heard);
    } finally {
      voiceBusy.current = false;
    }
  }

  function settleVoice() {
    const awaiting = useJarvis.getState().turns.some((item) => item.phase === "awaiting");
    const alts = candidatesRef.current.length
      ? candidatesRef.current
      : pendingRef.current
        ? [{ transcript: pendingRef.current, confidence: 1 }]
        : [];
    candidatesRef.current = [];
    pendingRef.current = "";
    if (!alts.length) {
      setVoiceNote("no-speech");
      return;
    }
    if (awaiting) {
      void acceptVoice(alts[0].transcript);
      return;
    }
    const reading = interpretSpeech(alts);
    if (!reading.text) {
      setVoiceNote("no-speech");
      return;
    }
    if (reading.uncertain) {
      setReview(reading);
      setLive(reading.raw);
      return;
    }
    void acceptVoice(reading.text, reading.raw);
  }

  function beginVoice() {
    if (busy || hearing || voiceBusy.current) return;
    const previous = recRef.current;
    recRef.current = null;
    if (previous) {
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      previous.abort();
    }
    cancelRef.current = false;
    pendingRef.current = "";
    candidatesRef.current = [];
    clearListenTimers();
    setLive("");
    setVoiceNote(null);
    setReview(null);
    setVoiceOpen(true);
    setMobile("dialog");
    const rec = createRecognizer();
    if (!rec) {
      setListening(false);
      setVoiceNote("unsupported");
      return;
    }
    recRef.current = rec;
    setListening(true);
    rec.onresult = (event) => {
      const alts = alternativesFrom(event.results);
      if (!alts.length) return;
      candidatesRef.current = alts;
      pendingRef.current = alts[0].transcript;
      setLive(alts[0].transcript);
      if (silenceRef.current) window.clearTimeout(silenceRef.current);
      silenceRef.current = window.setTimeout(() => {
        silenceRef.current = null;
        recRef.current?.stop();
      }, 900);
    };
    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      cancelRef.current = true;
      setListening(false);
      setVoiceNote(event.error);
    };
    rec.onend = () => {
      clearListenTimers();
      setListening(false);
      recRef.current = null;
      if (cancelRef.current) {
        cancelRef.current = false;
        return;
      }
      settleVoice();
    };
    try {
      rec.start();
      limitRef.current = window.setTimeout(() => {
        limitRef.current = null;
        recRef.current?.stop();
      }, 12000);
    } catch {
      setListening(false);
      recRef.current = null;
      setVoiceNote("audio-capture");
    }
  }

  function finishVoice() {
    clearListenTimers();
    const rec = recRef.current;
    if (!rec) {
      settleVoice();
      return;
    }
    rec.stop();
  }

  function cancelVoice() {
    cancelRef.current = true;
    pendingRef.current = "";
    candidatesRef.current = [];
    clearListenTimers();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    }
    setListening(false);
    setVoiceOpen(false);
    setLive("");
    setVoiceNote(null);
    setReview(null);
  }

  const reading = live ? interpretSpeech([{ transcript: live, confidence: 1 }]) : null;
  const recognized = Boolean(reading && reading.changed && !reading.uncertain && reading.text);

  return (
    <main className="flex h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-line">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <div>
            <p className="font-mono text-xs text-moss">демо-консоль</p>
            <h1 className="text-xl font-semibold tracking-tight">JARVIS</h1>
          </div>
          <button
            type="button"
            aria-pressed={dryRun}
            onClick={() => setDryRun(!dryRun)}
            className={
              "min-h-11 rounded-md px-3 font-mono text-xs " +
              (dryRun ? "bg-forest text-paper" : "bg-paper text-ink")
            }
          >
            {dryRun ? "DRY RUN" : "Боевой"}
          </button>
        </div>
        <div className="flex gap-2 px-4 py-3">
          {OPERATORS.map((operator) => {
            const active = operator.id === operatorId;
            return (
              <button
                key={operator.id}
                type="button"
                onClick={() => setOperator(operator.id)}
                className={
                  "min-h-11 flex-1 rounded-md border text-sm " +
                  (active ? "border-paper bg-paper text-ink" : "border-line text-muted")
                }
              >
                {operator.id === "admin1" ? "admin1" : "чужой ID"}
              </button>
            );
          })}
        </div>
        <p className="px-4 pb-3 font-mono text-xs text-subtle">
          Telegram → Whisper → ядро → политика → инструмент
        </p>
      </header>
      {stranger ? (
        <p className="border-b border-line px-4 py-2 text-sm text-danger">
          Этот Telegram ID не в allowlist. Команды будут отклонены.
        </p>
      ) : null}
      {!dryRun ? (
        <p className="border-b border-line bg-forest px-4 py-2 text-sm text-paper">
          Боевой режим здесь тоже симуляция: серверы компании не вызываются.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={`${mobile === "dialog" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col lg:flex`}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && !hearing ? (
              <div className="flex flex-col gap-4">
                <p className="max-w-xl text-pretty text-muted">
                  Нажмите микрофон и скажите команду. Если записи нет, те же фразы можно отправить текстом.
                  Намерение выбирает контур, инструмент берётся из runbook.
                </p>
                <div className="flex flex-col gap-2">
                  {VOICE_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void send(preset.text.replace(/^Джарвис, /, ""), "text")}
                      className="min-h-11 rounded-lg border border-line px-3 text-left text-sm"
                    >
                      {preset.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-2">
                <div className="ml-8 rounded-lg bg-elevated px-3 py-2">
                  <p className="font-mono text-xs text-subtle">
                    {turn.source === "voice" ? "голос" : "текст"} · {formatClock(turn.at)}
                  </p>
                  {turn.heard ? <p className="text-xs text-subtle">услышано: {turn.heard}</p> : null}
                  <p className="text-pretty text-sm">{turn.request}</p>
                </div>
                <TurnCard turn={turn} now={now} />
              </div>
            ))}
            {hearing ? (
              <div className="turn-in rounded-xl border border-line bg-surface p-4">
                <p className="font-mono text-xs text-moss">Whisper</p>
                <div className="mt-3">
                  <Wave />
                </div>
                <p className="mt-3 text-pretty text-sm text-muted">{hearing}</p>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft, "text");
            }}
          >
            <div className="flex gap-2 overflow-x-auto pb-2">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={locked}
                  onClick={() => void send(item.text, "text")}
                  className="min-h-11 shrink-0 rounded-full border border-line px-3 text-sm text-muted disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={locked}
                placeholder="Команда или фраза CONFIRM…"
                aria-label="Команда"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg disabled:opacity-40"
              />
              <button
                type="button"
                aria-label={listening ? "Остановить запись" : "Голосовая команда"}
                aria-pressed={listening}
                disabled={busy || hearing !== null}
                onClick={() => (listening ? finishVoice() : beginVoice())}
                className={
                  "flex size-11 items-center justify-center rounded-md disabled:opacity-40 " +
                  (listening ? "bg-forest text-paper" : "border border-line")
                }
              >
                {listening ? <Square className="size-4" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
              </button>
              <button
                type="submit"
                aria-label="Отправить"
                disabled={locked || draft.trim() === ""}
                className="flex size-11 items-center justify-center rounded-md bg-paper text-ink disabled:opacity-40"
              >
                <ArrowUp className="size-5" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
        <aside
          className={`${mobile === "dialog" ? "hidden" : "flex"} min-h-0 w-full flex-col border-line lg:flex lg:w-96 lg:border-l`}
        >
          <div className="hidden gap-2 px-4 pt-3 lg:flex">
            {SIDE.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPanel(item.id)}
                className={
                  "min-h-11 flex-1 rounded-md text-sm " +
                  (panel === item.id ? "bg-paper text-ink" : "text-muted")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <Side tab={mobile === "dialog" ? panel : mobile} />
          </div>
        </aside>
      </div>
      <nav className="grid grid-cols-4 border-t border-line lg:hidden">
        <NavButton
          label="Диалог"
          active={mobile === "dialog"}
          onClick={() => setMobile("dialog")}
          icon={<MessageSquare className="size-5" aria-hidden="true" />}
        />
        <NavButton
          label="Среда"
          active={mobile === "site"}
          onClick={() => {
            setPanel("site");
            setMobile("site");
          }}
          icon={<Server className="size-5" aria-hidden="true" />}
        />
        <NavButton
          label="Журнал"
          active={mobile === "audit"}
          onClick={() => {
            setPanel("audit");
            setMobile("audit");
          }}
          icon={<ScrollText className="size-5" aria-hidden="true" />}
        />
        <NavButton
          label="Доступ"
          active={mobile === "access"}
          onClick={() => {
            setPanel("access");
            setMobile("access");
          }}
          icon={<KeyRound className="size-5" aria-hidden="true" />}
        />
      </nav>
      {voiceOpen ? (
        <div className="fixed inset-0 z-20 flex items-end bg-ink/80" onClick={cancelVoice} role="presentation">
          <div
            role="dialog"
            aria-label="Голосовая команда"
            className="max-h-full w-full overflow-y-auto rounded-t-xl border border-line bg-surface p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{listening ? "Слушаю" : "Голос"}</h2>
                <p className="mt-1 text-pretty text-sm text-muted">
                  Говорите целиком и сделайте короткую паузу. Похожие слова сверяю со списком команд, опасные не угадываю.
                </p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={cancelVoice} className="flex size-11 items-center justify-center">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {listening || live ? (
              <div className="mt-4" aria-live="polite">
                <Wave />
                <p className="mt-3 min-h-6 text-pretty text-sm">{live || "Говорите"}</p>
                {recognized && reading ? <p className="mt-1 text-sm text-moss">разбор: {reading.text}</p> : null}
              </div>
            ) : null}
            {voiceNote ? <p className="mt-4 text-pretty text-sm text-warn">{voiceNoteText(voiceNote)}</p> : null}
            {review?.uncertain ? (
              <div className="mt-4">
                <p className="text-pretty text-sm">Услышал «{review.raw}». Уточните команду.</p>
                <div className="mt-2 flex flex-col gap-2">
                  {review.choices.map((choice) => (
                    <button
                      key={choice.text}
                      type="button"
                      onClick={() => void acceptVoice(choice.text, review.raw)}
                      className="min-h-11 rounded-md border border-line px-3 text-left text-sm"
                    >
                      {choice.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void acceptVoice(review.raw)}
                    className="min-h-11 px-3 text-left text-sm text-muted"
                  >
                    Оставить как услышано
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {listening ? (
                <button type="button" onClick={finishVoice} className="min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink">
                  Готово
                </button>
              ) : (
                <button type="button" onClick={beginVoice} className="min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink">
                  {voiceNote ? "Повторить" : "Слушать"}
                </button>
              )}
              <button type="button" onClick={cancelVoice} className="min-h-11 rounded-md px-3 text-sm text-muted">
                Отмена
              </button>
            </div>
            <p className="mt-5 text-sm text-subtle">Или пример фразы</p>
            <div className="mt-2 flex flex-col gap-2">
              {VOICE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    clearListenTimers();
                    const rec = recRef.current;
                    recRef.current = null;
                    if (rec) {
                      rec.onresult = null;
                      rec.onerror = null;
                      rec.onend = null;
                      rec.abort();
                    }
                    setListening(false);
                    void acceptVoice(preset.text);
                  }}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line px-3 text-left text-sm"
                >
                  <span className="text-pretty">{preset.text}</span>
                  <span className="font-mono text-xs text-subtle tabular-nums">{preset.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function NavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "text-paper" : "text-subtle"}`}
    >
      {icon}
      {label}
    </button>
  );
}
