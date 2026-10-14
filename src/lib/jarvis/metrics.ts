export type CounterMetric =
  | "jarvis_commands_total"
  | "jarvis_commands_allowed_total"
  | "jarvis_commands_denied_total"
  | "jarvis_commands_failed_total"
  | "jarvis_approval_requested_total"
  | "jarvis_approval_approved_total"
  | "jarvis_approval_denied_total"
  | "jarvis_approval_expired_total"
  | "jarvis_executor_calls_total"
  | "jarvis_executor_failures_total"
  | "jarvis_rate_limit_denied_total"
  | "jarvis_idempotency_duplicates_total"
  | "jarvis_audit_delivery_failures_total"
  | "jarvis_worker_jobs_total"
  | "jarvis_worker_failures_total"
  | "jarvis_voice_turns_total"
  | "jarvis_stt_failures_total"
  | "jarvis_tts_failures_total"
  | "jarvis_telegram_updates_total";

export type DurationMetric =
  | "jarvis_command_duration_seconds"
  | "jarvis_executor_duration_seconds"
  | "jarvis_lock_wait_seconds";

export type MetricName =
  | "requests"
  | "allowed"
  | "denied"
  | "approvals"
  | "failed"
  | "duration_ms"
  | "stt_ms"
  | "voice_turns"
  | "stt_failures"
  | "tts_ms"
  | "tts_failures"
  | "telegram_updates";

type DurationState = { count: number; sum: number };

const counters: Record<CounterMetric, number> = {
  jarvis_commands_total: 0,
  jarvis_commands_allowed_total: 0,
  jarvis_commands_denied_total: 0,
  jarvis_commands_failed_total: 0,
  jarvis_approval_requested_total: 0,
  jarvis_approval_approved_total: 0,
  jarvis_approval_denied_total: 0,
  jarvis_approval_expired_total: 0,
  jarvis_executor_calls_total: 0,
  jarvis_executor_failures_total: 0,
  jarvis_rate_limit_denied_total: 0,
  jarvis_idempotency_duplicates_total: 0,
  jarvis_audit_delivery_failures_total: 0,
  jarvis_worker_jobs_total: 0,
  jarvis_worker_failures_total: 0,
  jarvis_voice_turns_total: 0,
  jarvis_stt_failures_total: 0,
  jarvis_tts_failures_total: 0,
  jarvis_telegram_updates_total: 0,
};

const durations: Record<DurationMetric, DurationState> = {
  jarvis_command_duration_seconds: { count: 0, sum: 0 },
  jarvis_executor_duration_seconds: { count: 0, sum: 0 },
  jarvis_lock_wait_seconds: { count: 0, sum: 0 },
};

let legacySttMs = 0;
let legacyTtsMs = 0;

export function increment(name: CounterMetric, by = 1): void {
  if (!Number.isFinite(by) || by < 0) return;
  counters[name] += by;
}

export function observeDuration(name: DurationMetric, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  durations[name].count += 1;
  durations[name].sum += seconds;
}

export function mark(name: MetricName, by = 1): void {
  switch (name) {
    case "requests":
      increment("jarvis_commands_total", by);
      return;
    case "allowed":
      increment("jarvis_commands_allowed_total", by);
      return;
    case "denied":
      increment("jarvis_commands_denied_total", by);
      return;
    case "approvals":
      increment("jarvis_approval_requested_total", by);
      return;
    case "failed":
      increment("jarvis_commands_failed_total", by);
      return;
    case "duration_ms":
      observeDuration("jarvis_command_duration_seconds", by / 1000);
      return;
    case "stt_ms":
      legacySttMs += by;
      return;
    case "voice_turns":
      increment("jarvis_voice_turns_total", by);
      return;
    case "stt_failures":
      increment("jarvis_stt_failures_total", by);
      return;
    case "tts_ms":
      legacyTtsMs += by;
      return;
    case "tts_failures":
      increment("jarvis_tts_failures_total", by);
      return;
    case "telegram_updates":
      increment("jarvis_telegram_updates_total", by);
      return;
  }
}

export function snapshot(extra: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    ...counters,
    jarvis_command_duration_seconds_count: durations.jarvis_command_duration_seconds.count,
    jarvis_command_duration_seconds_sum: durations.jarvis_command_duration_seconds.sum,
    jarvis_executor_duration_seconds_count: durations.jarvis_executor_duration_seconds.count,
    jarvis_executor_duration_seconds_sum: durations.jarvis_executor_duration_seconds.sum,
    jarvis_lock_wait_seconds_count: durations.jarvis_lock_wait_seconds.count,
    jarvis_lock_wait_seconds_sum: durations.jarvis_lock_wait_seconds.sum,
    stt_ms: legacySttMs,
    tts_ms: legacyTtsMs,
    ...extra,
  };
}

export type PrometheusGauge = {
  name: string;
  value: number;
  help?: string;
  labels?: Record<string, string>;
};

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function labelText(labels: Record<string, string> | undefined): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const body = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",");
  return `{${body}}`;
}

export function renderPrometheus(gauges: PrometheusGauge[] = []): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(counters) as Array<[CounterMetric, number]>) {
    lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
  }
  for (const [name, value] of Object.entries(durations) as Array<[DurationMetric, DurationState]>) {
    lines.push(
      `# TYPE ${name} summary`,
      `${name}_count ${value.count}`,
      `${name}_sum ${value.sum}`,
    );
  }
  for (const gauge of gauges) {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(gauge.name) || !Number.isFinite(gauge.value)) continue;
    if (gauge.help) lines.push(`# HELP ${gauge.name} ${gauge.help.replace(/[\r\n]+/g, " ")}`);
    lines.push(`# TYPE ${gauge.name} gauge`, `${gauge.name}${labelText(gauge.labels)} ${gauge.value}`);
  }
  return lines.join("\n") + "\n";
}
