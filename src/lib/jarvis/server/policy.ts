import type { PolicyName } from "./runbooks.ts";

export type PolicyRuntime = {
  mode: "dry-run" | "mock" | "real";
  elevated?: boolean;
  maintenanceWindow?: boolean;
};

export type PolicyGate =
  | { code: "ALLOW" }
  | { code: "APPROVAL_REQUIRED" }
  | { code: "DENY"; reason: string };

export function evaluateRuntimePolicy(policy: PolicyName, runtime: PolicyRuntime): PolicyGate {
  if (policy === "DENY_ALWAYS") return { code: "DENY", reason: "DENY_ALWAYS нельзя отменить approval." };
  if (policy === "APPROVAL_REQUIRED") return { code: "APPROVAL_REQUIRED" };
  if (policy === "DRY_RUN_ONLY") {
    return runtime.mode === "dry-run"
      ? { code: "ALLOW" }
      : { code: "DENY", reason: "Runbook разрешён только в dry-run." };
  }
  if (policy === "ELEVATION_REQUIRED") {
    return runtime.elevated
      ? { code: "ALLOW" }
      : { code: "DENY", reason: "Требуется server-side elevation capability." };
  }
  if (policy === "MAINTENANCE_WINDOW_REQUIRED") {
    return runtime.maintenanceWindow
      ? { code: "ALLOW" }
      : { code: "DENY", reason: "Runbook разрешён только в окне обслуживания." };
  }
  return { code: "ALLOW" };
}

function localMinutes(now: Date, timezone: string): number | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function clock(value: string): number | null {
  const hit = /^(\d{2}):(\d{2})$/.exec(value);
  if (!hit) return null;
  const hour = Number(hit[1]);
  const minute = Number(hit[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function maintenanceWindowOpen(
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const timezone = env.JARVIS_TIMEZONE?.trim() || "Europe/Kyiv";
  const range = env.JARVIS_MAINTENANCE_WINDOW?.trim() || "22:00-06:00";
  const [fromRaw, toRaw, extra] = range.split("-");
  if (extra !== undefined) return false;
  const from = clock(fromRaw ?? "");
  const to = clock(toRaw ?? "");
  const current = localMinutes(now, timezone);
  if (from === null || to === null || current === null) return false;
  if (from === to) return false;
  if (from < to) return current >= from && current < to;
  return current >= from || current < to;
}
