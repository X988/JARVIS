import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";

export type Incident = {
  id: string;
  startedAt: string;
  source: string;
  target: string;
  severity: "info" | "warn" | "bad";
  findings: string[];
  timeline: string[];
  suggested: string[];
  performed: string[];
  status: "open" | "closed";
  resolution: string | null;
};

export type IncidentUpdate = {
  finding?: string;
  suggested?: string;
  performed?: string;
  timeline?: string;
  severity?: Incident["severity"];
};

const ID = /^[A-Za-z0-9._:-]{1,96}$/;
const REF = /^[A-Za-z0-9._:/-]{1,160}$/;
const SECRET =
  /(?:password|парол|credential|secret|token|токен|api[_ -]?key|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]?/i;

function validText(value: string): boolean {
  return Boolean(value.trim()) && value.length <= 2_000 && !SECRET.test(value);
}

function validIncident(item: Incident): boolean {
  return (
    ID.test(item.id) &&
    REF.test(item.source) &&
    REF.test(item.target) &&
    Number.isFinite(Date.parse(item.startedAt)) &&
    ["info", "warn", "bad"].includes(item.severity) &&
    Array.isArray(item.findings) &&
    Array.isArray(item.timeline) &&
    Array.isArray(item.suggested) &&
    Array.isArray(item.performed) &&
    (item.status === "open" || item.status === "closed") &&
    (item.resolution === null || typeof item.resolution === "string")
  );
}

function incidentFile(dir: string): string {
  return path.join(dir, "incidents.json");
}

function writeIncidents(dir: string, incidents: Incident[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = incidentFile(dir);
  const temp = target + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(incidents, null, 2));
  fs.renameSync(temp, target);
}

export function loadIncidents(dir: string): Incident[] {
  const target = incidentFile(dir);
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Incident => Boolean(item && typeof item === "object" && validIncident(item as Incident)))
      .map((item) => ({
        ...item,
        findings: [...item.findings],
        timeline: [...item.timeline],
        suggested: [...item.suggested],
        performed: [...item.performed],
      }));
  } catch {
    return [];
  }
}

export function openIncident(
  partial: Pick<Incident, "id" | "startedAt" | "source" | "target" | "severity">,
): Incident {
  return {
    ...partial,
    findings: [],
    timeline: [partial.startedAt],
    suggested: [],
    performed: [],
    status: "open",
    resolution: null,
  };
}

export function createIncident(
  dir: string,
  partial: Pick<Incident, "id" | "startedAt" | "source" | "target" | "severity">,
): { ok: true; incident: Incident } | { ok: false; code: "INVALID" | "DUPLICATE" } {
  const incident = openIncident(partial);
  if (!validIncident(incident)) return { ok: false, code: "INVALID" };
  return withStateLock(dir, () => {
    const incidents = loadIncidents(dir);
    if (incidents.some((item) => item.id === incident.id)) {
      return { ok: false as const, code: "DUPLICATE" as const };
    }
    incidents.push(incident);
    writeIncidents(dir, incidents);
    return { ok: true as const, incident };
  });
}

export function updateIncident(
  dir: string,
  id: string,
  patch: IncidentUpdate,
  now = new Date(),
): { ok: true; incident: Incident } | { ok: false; code: "NOT_FOUND" | "CLOSED" | "SECRET" | "INVALID" } {
  if (!ID.test(id)) return { ok: false, code: "INVALID" };
  const textFields = [patch.finding, patch.suggested, patch.performed, patch.timeline].filter(
    (value): value is string => typeof value === "string",
  );
  if (textFields.some((value) => SECRET.test(value))) return { ok: false, code: "SECRET" };
  if (textFields.some((value) => !validText(value))) return { ok: false, code: "INVALID" };

  return withStateLock(dir, () => {
    const incidents = loadIncidents(dir);
    const index = incidents.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false as const, code: "NOT_FOUND" as const };
    const current = incidents[index];
    if (current.status === "closed") return { ok: false as const, code: "CLOSED" as const };

    const next: Incident = {
      ...current,
      severity: patch.severity ?? current.severity,
      findings: patch.finding ? [...current.findings, patch.finding.trim()].slice(-200) : [...current.findings],
      suggested: patch.suggested ? [...current.suggested, patch.suggested.trim()].slice(-200) : [...current.suggested],
      performed: patch.performed ? [...current.performed, patch.performed.trim()].slice(-200) : [...current.performed],
      timeline: patch.timeline
        ? [...current.timeline, `${now.toISOString()} ${patch.timeline.trim()}`].slice(-500)
        : [...current.timeline],
    };
    incidents[index] = next;
    writeIncidents(dir, incidents);
    return { ok: true as const, incident: next };
  });
}

export function closeIncident(
  dir: string,
  id: string,
  resolution: string,
  now = new Date(),
): { ok: true; incident: Incident } | { ok: false; code: "NOT_FOUND" | "CLOSED" | "SECRET" | "INVALID" } {
  if (!ID.test(id) || !validText(resolution)) {
    return { ok: false, code: SECRET.test(resolution) ? "SECRET" : "INVALID" };
  }
  return withStateLock(dir, () => {
    const incidents = loadIncidents(dir);
    const index = incidents.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false as const, code: "NOT_FOUND" as const };
    const current = incidents[index];
    if (current.status === "closed") return { ok: false as const, code: "CLOSED" as const };
    const next: Incident = {
      ...current,
      status: "closed",
      resolution: resolution.trim(),
      timeline: [...current.timeline, `${now.toISOString()} closed`].slice(-500),
    };
    incidents[index] = next;
    writeIncidents(dir, incidents);
    return { ok: true as const, incident: next };
  });
}

export function correlate(events: { title: string }[]): string | null {
  const text = events.map((item) => item.title.toLowerCase()).join(" ");
  const backup = /backup|резерв/.test(text);
  const disk = /disk|диск|io/.test(text);
  const slow = /1с|1c|response|тормоз/.test(text);
  if (backup && (disk || slow)) {
    return "Нагрузка совпадает с резервным копированием. Это связь, не команда на ремонт.";
  }
  return null;
}
