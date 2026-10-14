import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "./state-lock.ts";
import type { ExecResult } from "./pipeline.ts";

export type ProbeState =
  | "UNPROBED"
  | "HEALTHY"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "CREDENTIAL_UNAVAILABLE"
  | "NOT_CONFIGURED";

export type ProbeRecord = {
  status: Exclude<ProbeState, "UNPROBED">;
  checkedAt: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  reason: string;
};

export type ProbeView = Omit<ProbeRecord, "status"> & {
  status: ProbeState;
  stale: boolean;
};

type ProbeFile = Record<string, ProbeRecord>;

function targetFile(dir: string): string {
  return path.join(dir, "adapter-probes.json");
}

function validRecord(value: unknown): value is ProbeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ProbeRecord>;
  const states = new Set<ProbeRecord["status"]>([
    "HEALTHY",
    "DEGRADED",
    "UNAVAILABLE",
    "CREDENTIAL_UNAVAILABLE",
    "NOT_CONFIGURED",
  ]);
  return (
    typeof item.status === "string" &&
    states.has(item.status as ProbeRecord["status"]) &&
    typeof item.checkedAt === "number" &&
    Number.isFinite(item.checkedAt) &&
    (item.lastSuccessAt === null ||
      (typeof item.lastSuccessAt === "number" && Number.isFinite(item.lastSuccessAt))) &&
    (item.lastFailureAt === null ||
      (typeof item.lastFailureAt === "number" && Number.isFinite(item.lastFailureAt))) &&
    typeof item.reason === "string" &&
    item.reason.length <= 1_000
  );
}

export function loadProbeState(dir: string): ProbeFile {
  const file = targetFile(dir);
  if (!fs.existsSync(file)) return Object.create(null) as ProbeFile;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new Error("adapter probe state is invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adapter probe state has invalid shape");
  }
  const out = Object.create(null) as ProbeFile;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,64}$/.test(key) || !validRecord(value)) {
      throw new Error("adapter probe state contains an invalid entry");
    }
    out[key] = value;
  }
  return out;
}

function writeProbeState(dir: string, body: ProbeFile): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = targetFile(dir);
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(body, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function stateFromResult(result: ExecResult): ProbeRecord["status"] {
  if (result.code === "OK") return "HEALTHY";
  if (result.code === "VERIFICATION_FAILED") return "DEGRADED";
  if (result.code === "CREDENTIAL_UNAVAILABLE") return "CREDENTIAL_UNAVAILABLE";
  if (result.code === "NOT_CONFIGURED" || result.code === "ADAPTER_DISABLED") {
    return "NOT_CONFIGURED";
  }
  return "UNAVAILABLE";
}

export function recordAdapterProbe(
  dir: string,
  adapter: string,
  result: ExecResult,
  now = Date.now(),
): void {
  if (!/^[a-z0-9-]{1,64}$/.test(adapter)) return;
  withStateLock(dir, () => {
    const all = loadProbeState(dir);
    const previous = all[adapter];
    const status = stateFromResult(result);
    all[adapter] = {
      status,
      checkedAt: now,
      lastSuccessAt: status === "HEALTHY" ? now : previous?.lastSuccessAt ?? null,
      lastFailureAt: status === "HEALTHY" ? previous?.lastFailureAt ?? null : now,
      reason: result.code,
    };
    writeProbeState(dir, all);
  });
}

export function probeViews(
  passive: Record<string, string>,
  dir: string,
  now = Date.now(),
  ttlMs = 120_000,
): Record<string, ProbeView> {
  let stored: ProbeFile;
  try {
    stored = loadProbeState(dir);
  } catch {
    stored = Object.create(null) as ProbeFile;
    const failed: Record<string, ProbeView> = {};
    for (const [adapter, status] of Object.entries(passive)) {
      failed[adapter] = {
        status:
          status === "NOT_CONFIGURED"
            ? "NOT_CONFIGURED"
            : status === "CREDENTIAL_UNAVAILABLE"
              ? "CREDENTIAL_UNAVAILABLE"
              : "UNAVAILABLE",
        checkedAt: 0,
        lastSuccessAt: null,
        lastFailureAt: now,
        reason: "STATE_CORRUPT",
        stale: true,
      };
    }
    return failed;
  }

  const out: Record<string, ProbeView> = {};
  for (const [adapter, configured] of Object.entries(passive)) {
    if (configured === "NOT_CONFIGURED") {
      out[adapter] = {
        status: "NOT_CONFIGURED",
        checkedAt: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "NOT_CONFIGURED",
        stale: false,
      };
      continue;
    }
    if (configured === "CREDENTIAL_UNAVAILABLE") {
      out[adapter] = {
        status: "CREDENTIAL_UNAVAILABLE",
        checkedAt: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "CREDENTIAL_UNAVAILABLE",
        stale: false,
      };
      continue;
    }

    const record = stored[adapter];
    if (!record) {
      out[adapter] = {
        status: "UNPROBED",
        checkedAt: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "NO_LIVE_PROBE",
        stale: true,
      };
      continue;
    }
    const stale = now - record.checkedAt > ttlMs;
    out[adapter] = {
      ...record,
      status: stale ? "UNPROBED" : record.status,
      reason: stale ? "PROBE_STALE" : record.reason,
      stale,
    };
  }
  return out;
}
