export type MetricName = "requests" | "allowed" | "denied" | "approvals" | "failed" | "duration_ms";

const counters: Record<MetricName, number> = {
  requests: 0,
  allowed: 0,
  denied: 0,
  approvals: 0,
  failed: 0,
  duration_ms: 0,
};

export function mark(name: MetricName, by = 1): void {
  counters[name] += by;
}

export function snapshot(executors: Record<string, string>): Record<string, number | string> {
  return { ...counters, ...executors };
}
