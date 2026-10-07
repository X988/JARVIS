export const FRAME_MS = 30;
export const ENDPOINT_SILENCE_MS = 800;
export const MAX_UTTERANCE_MS = 30_000;
export const PRE_ROLL_MS = 240;
export const MIN_SPEECH_MS = 200;
export const MIN_CONFIDENCE = 0.55;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export type VoiceKind = "silence" | "noise" | "speech";

export type SpokenAlias = { from: string; to: string };

const HALLUCINATIONS = /^(thanks for watching|thank you\.?|you|субтитры|субтитры создавал.*|продолжение следует|спасибо за просмотр|подписывайтесь.*|приятного просмотра)\.?$/i;

export const SPOKEN: SpokenAlias[] = [
  { from: "ютп", to: "utp" },
  { from: "утепе", to: "utp" },
  { from: "ютепе", to: "utp" },
  { from: "ю ти пи", to: "utp" },
  { from: "у ти пи", to: "utp" },
  { from: "уп", to: "utp" },
  { from: "майлков", to: "mailcow" },
  { from: "мейлков", to: "mailcow" },
  { from: "мейлкау", to: "mailcow" },
  { from: "майл кау", to: "mailcow" },
  { from: "микрот", to: "mikrotik" },
  { from: "микротик", to: "mikrotik" },
  { from: "микро тик", to: "mikrotik" },
  { from: "вайргард", to: "wireguard" },
  { from: "вайр гард", to: "wireguard" },
  { from: "ваер гард", to: "wireguard" },
];

export function classifyPcm(samples: Int16Array, sampleRate = 16_000): VoiceKind {
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  let peak = 0;
  let run = 0;
  let longest = 0;
  for (let index = 0; index < samples.length; index += frame) {
    let sum = 0;
    let count = 0;
    const end = Math.min(samples.length, index + frame);
    for (let cursor = index; cursor < end; cursor += 1) {
      const value = samples[cursor] / 32768;
      sum += value * value;
      count += 1;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    peak = Math.max(peak, rms);
    if (rms > 0.02) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  if (peak < 0.01) return "silence";
  if (longest * FRAME_MS < MIN_SPEECH_MS) return "noise";
  return "speech";
}

export function bargeIn(frames: { rms: number }[], noiseFloor: number): boolean {
  const need = Math.ceil(MIN_SPEECH_MS / FRAME_MS);
  let run = 0;
  for (const frame of frames) {
    if (frame.rms > Math.max(0.02, noiseFloor * 3)) run += 1;
    else run = 0;
    if (run >= need) return true;
  }
  return false;
}

export function prependPreroll(chunks: Int16Array[], preroll: Int16Array): Int16Array {
  const total = preroll.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  out.set(preroll, 0);
  let offset = preroll.length;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function hallucination(text: string): boolean {
  return HALLUCINATIONS.test(text.trim());
}

export function normalizeTranscript(
  text: string,
  confidence: number,
  aliases: SpokenAlias[] = SPOKEN,
  minConfidence = MIN_CONFIDENCE,
): { text: string; changed: boolean; code: "OK" | "CLARIFY" } {
  if (confidence < minConfidence) return { text, changed: false, code: "CLARIFY" };
  let next = text.normalize("NFKC").replace(/[.,!?;:()[\\]{}"«»]+/g, " ");
  for (const alias of [...aliases].sort((left, right) => right.from.length - left.from.length)) {
    if (alias.from.length < 2 || alias.from === alias.to) continue;
    const pattern = new RegExp(`(^|\\s)${alias.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "gi");
    next = next.replace(pattern, `$1${alias.to}`);
  }
  next = next.replace(/\s+/g, " ").trim();
  return { text: next, changed: next.toLowerCase() !== text.trim().toLowerCase(), code: "OK" };
}

export function stripWake(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return text.replace(/^(джарвис|жарвис)(?:[,.:;!?\s]+|$)/i, "").trim();
}

export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[a-f0-9]{16,}\b/gi, " ")
    .replace(/[*_`#>[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentences(text: string): string[] {
  const clean = sanitizeForSpeech(text);
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export type VoiceContext = {
  mode?: string;
  executionCalled?: boolean;
  target?: string;
  runbook?: string;
  execution?: string;
};

function metric(detail: string, key: string): number | null {
  const hit = detail.match(new RegExp("(?:^|[;\\s])" + key + "=(\\d+(?:\\.\\d+)?)", "i"));
  return hit ? Number(hit[1]) : null;
}

function textMetric(detail: string, key: string): string | null {
  const hit = detail.match(new RegExp("(?:^|[;\\s])" + key + "=([^;]+)", "i"));
  return hit?.[1]?.trim() || null;
}

function uptimeText(seconds: number): string {
  if (seconds >= 86400) return Math.floor(seconds / 86400) + " дн.";
  if (seconds >= 3600) return Math.floor(seconds / 3600) + " ч.";
  return Math.max(1, Math.floor(seconds / 60)) + " мин.";
}

export function voiceLine(
  code: string,
  reason: string | null,
  approvalId?: string | null,
  context: VoiceContext = {},
): string {
  const detail = context.execution ?? reason ?? "";
  if (code === "POLICY_DENIED" && /баз/i.test(reason ?? "")) return "Отказ. Удаление рабочей базы запрещено.";
  if (code === "POLICY_DENIED") return "Отказ. Политика безопасности это не разрешает.";
  if (code === "APPROVAL_REQUIRED") return approvalId ? "Нужно подтверждение. Код заявки отправил текстом." : "Нужно подтверждение. Сам ничего не запускаю.";
  if (code === "CLARIFY" || code === "STT_LOW_CONFIDENCE") return "Не расслышал достаточно уверенно. Повторите команду чуть медленнее.";
  if (code === "NO_SPEECH") return "Речь не распознана. Ничего не запускал.";
  if (code === "AUDIO_DECODE_FAILED") return "Не удалось открыть голосовое сообщение. Ничего не запускал.";
  if (code === "EMPTY") return "Голосовое сообщение пустое. Ничего не запускал.";
  if (code === "AUDIO_TOO_LARGE") return "Голосовое сообщение слишком большое. Ничего не запускал.";
  if (code === "AUDIO_TOO_LONG") return "Голосовая команда слишком длинная. Скажите команду короче.";
  if (code === "TARGET_NOT_FOUND") return "Не нашёл такую цель в inventory. Уточните сервер или сервис.";
  if (code === "RUNBOOK_NOT_FOUND") return "Для этой команды нет разрешённого сценария.";
  if (code === "CONNECT_FAILED") return "Не удалось подключиться к " + (context.target || "цели") + ". Ничего не считаю выполненным.";
  if (code === "EXECUTION_TIMEOUT") return "Проверка превысила допустимое время. Результат не засчитан.";
  if (code === "VERIFICATION_FAILED") return "Ответ получен, но проверка результата не прошла. Успех не засчитан.";
  if (code === "EXECUTION_DISABLED" || code === "NOT_CONFIGURED" || code === "CREDENTIAL_UNAVAILABLE" || code === "ADAPTER_DISABLED") {
    const first = sentences(reason ?? detail)[0];
    return first ? first.slice(0, 190) : "Исполнитель ещё не настроен. Ничего не запускал.";
  }
  if (code === "OK" && context.mode === "dry-run") return "Команда проверена. Сейчас режим dry-run, реальное подключение не выполнялось.";
  if (code === "OK" && context.mode === "mock") return "Команда прошла в тестовом режиме. Реальная инфраструктура не менялась.";
  if (code === "OK" && context.runbook === "sql.health") return "База " + (context.target || "SQL").toUpperCase() + " отвечает. Состояние онлайн.";
  if (code === "OK" && context.runbook === "sql.backup") return "Резервная копия " + (context.target || "SQL").toUpperCase() + " создана и проверена.";

  if (code === "OK" && context.runbook === "mailcow.health") {
    const services = metric(detail, "services");
    const running = metric(detail, "running");
    const unhealthy = metric(detail, "unhealthy");
    const queue = metric(detail, "queue");
    if (services !== null && running !== null && unhealthy !== null && queue !== null) {
      return "Mailcow отвечает. Сервисов " + services + ", запущено " + running + ", проблемных " + unhealthy + ", писем в очереди " + queue + ".";
    }
  }
  if (code === "OK" && context.runbook === "mikrotik.status") {
    const cpu = metric(detail, "cpu_load");
    const interfaces = metric(detail, "interfaces");
    const running = metric(detail, "running");
    const routes = metric(detail, "active_routes");
    if (cpu !== null && interfaces !== null && running !== null && routes !== null) {
      return "MikroTik отвечает. Загрузка процессора " + cpu + " процентов. Интерфейсов " + interfaces + ", работают " + running + ", активных маршрутов " + routes + ".";
    }
  }
  if (code === "OK" && context.runbook === "wireguard.status") {
    const peers = metric(detail, "peers");
    const recent = metric(detail, "recent");
    const stale = metric(detail, "stale_or_never");
    if (peers !== null && recent !== null && stale !== null) {
      return "WireGuard: пиров " + peers + ", со свежим соединением " + recent + ", без свежего соединения " + stale + ".";
    }
  }
  if (code === "OK" && context.runbook === "disk.check") {
    const worst = metric(detail, "worst_used_pct");
    if (worst !== null) return "Диски " + (context.target || "") + ": максимальное заполнение " + worst + " процентов.";
  }
  if (code === "OK" && context.runbook === "server.health") {
    const host = textMetric(detail, "host") || context.target || "сервер";
    const uptime = metric(detail, "uptime_s");
    const failed = metric(detail, "failed_services") ?? metric(detail, "failed_auto_services");
    if (uptime !== null) {
      return "Сервер " + host + " отвечает. Время работы " + uptimeText(uptime) + (failed !== null ? ". Проблемных служб: " + failed : "") + ".";
    }
  }
  const first = sentences(detail)[0];
  return first ? first.slice(0, 190) : "Готово. Подробности отправил текстом.";
}

export function wavConvertArgs(input: string, output: string): string[] {
  return ["-nostdin", "-y", "-i", input, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", output];
}
