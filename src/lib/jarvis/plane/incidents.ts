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

export function openIncident(partial: Pick<Incident, "id" | "startedAt" | "source" | "target" | "severity">): Incident {
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

export function correlate(events: { title: string }[]): string | null {
  const text = events.map((item) => item.title.toLowerCase()).join(" ");
  const backup = /backup|резерв/.test(text);
  const disk = /disk|диск|io/.test(text);
  const slow = /1с|1c|response|тормоз/.test(text);
  if (backup && (disk || slow)) return "Нагрузка совпадает с резервным копированием. Это связь, не команда на ремонт.";
  return null;
}
