/**
 * Simple circuit breaker for LLM calls.
 * States: closed → open (after N failures) → half-open (after cooldown) → closed.
 */

export type CircuitState = "closed" | "open" | "half-open";

export type CircuitBreakerOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenMax?: number;
};

type Bucket = {
  state: CircuitState;
  failures: number;
  openedAt: number;
  halfOpenInFlight: number;
};

const buckets = new Map<string, Bucket>();

function opts(env: NodeJS.ProcessEnv = process.env): Required<CircuitBreakerOptions> {
  const failureThreshold = Math.max(1, Math.min(20, Number(env.JARVIS_LLM_CB_FAILURES) || 5));
  const cooldownMs = Math.max(1_000, Math.min(300_000, Number(env.JARVIS_LLM_CB_COOLDOWN_MS) || 30_000));
  const halfOpenMax = Math.max(1, Math.min(5, Number(env.JARVIS_LLM_CB_HALF_OPEN) || 1));
  return { failureThreshold, cooldownMs, halfOpenMax };
}

function bucket(key: string): Bucket {
  let b = buckets.get(key);
  if (!b) {
    b = { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: 0 };
    buckets.set(key, b);
  }
  return b;
}

export function circuitKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export function circuitState(key: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): CircuitState {
  const b = bucket(key);
  const { cooldownMs } = opts(env);
  if (b.state === "open" && now - b.openedAt >= cooldownMs) {
    b.state = "half-open";
    b.halfOpenInFlight = 0;
  }
  return b.state;
}

export function circuitAllow(key: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  const state = circuitState(key, now, env);
  const b = bucket(key);
  const { halfOpenMax } = opts(env);
  if (state === "open") return false;
  if (state === "half-open") {
    if (b.halfOpenInFlight >= halfOpenMax) return false;
    b.halfOpenInFlight += 1;
  }
  return true;
}

export function circuitSuccess(key: string): void {
  const b = bucket(key);
  b.failures = 0;
  b.state = "closed";
  b.halfOpenInFlight = 0;
  b.openedAt = 0;
}

export function circuitFailure(key: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env): void {
  const b = bucket(key);
  const { failureThreshold } = opts(env);
  b.failures += 1;
  b.halfOpenInFlight = Math.max(0, b.halfOpenInFlight - 1);
  if (b.state === "half-open" || b.failures >= failureThreshold) {
    b.state = "open";
    b.openedAt = now;
    b.failures = 0;
  }
}

export function resetCircuits(): void {
  buckets.clear();
}
