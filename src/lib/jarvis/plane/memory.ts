import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";

export type MemoryKind =
  | "conversation"
  | "infrastructure"
  | "incident"
  | "procedure"
  | "development"
  | "preference";

export type MemoryNote = {
  id: string;
  kind: MemoryKind;
  at: string;
  source: string;
  text: string;
};

export type MemoryHit = MemoryNote & {
  score: number;
  snippet: string;
};

export type MemorySearchOptions = {
  kinds?: MemoryKind[];
  limit?: number;
  since?: string;
  until?: string;
};

const SECRET =
  /(?:password|парол|credential|secret|token|токен|api[_ -]?key|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]?/i;
const CRITICAL_INFRA =
  /(?:\bip\b|ip[- ]?address|адрес\s+сервера|роль\s+сервера|server\s+role|environment|окружени|db\s*mapping|сопоставлен.*баз|production\s+database)/i;
const WORD = /[\p{L}\p{N}_-]+/gu;

export function memoryFile(dir: string): string {
  return path.join(dir, "memory.jsonl");
}

function validNote(note: MemoryNote): boolean {
  return (
    /^[A-Za-z0-9._:-]{1,96}$/.test(note.id) &&
    Boolean(note.source.trim()) &&
    Boolean(note.text.trim()) &&
    Number.isFinite(Date.parse(note.at))
  );
}

function readNotes(dir: string): MemoryNote[] {
  const file = memoryFile(dir);
  if (!fs.existsSync(file)) return [];
  const out: MemoryNote[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const note = JSON.parse(line) as MemoryNote;
      if (validNote(note)) out.push(note);
    } catch {
      // Corrupted lines are ignored during recall; append-only source stays untouched.
    }
  }
  return out;
}

export function remember(
  dir: string,
  note: MemoryNote,
): { ok: true } | { ok: false; code: "CRITICAL_FACT" | "SECRET" | "INVALID" | "DUPLICATE" } {
  if (!validNote(note)) return { ok: false, code: "INVALID" };
  if (SECRET.test(note.text)) return { ok: false, code: "SECRET" };
  if (note.kind === "infrastructure" && CRITICAL_INFRA.test(note.text)) {
    return { ok: false, code: "CRITICAL_FACT" };
  }

  return withStateLock(dir, () => {
    const notes = readNotes(dir);
    if (notes.some((item) => item.id === note.id)) return { ok: false as const, code: "DUPLICATE" as const };
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(memoryFile(dir), JSON.stringify({ ...note, text: note.text.trim(), source: note.source.trim() }) + "\n");
    return { ok: true as const };
  });
}

/**
 * Critical infrastructure facts never update inventory through memory.
 * A caller may create an approval/workflow proposal, but this function deliberately performs no write.
 */
export function proposeCriticalInfrastructureFact(note: MemoryNote): {
  code: "CONTROLLED_WORKFLOW_REQUIRED";
  proposed: MemoryNote;
} {
  return { code: "CONTROLLED_WORKFLOW_REQUIRED", proposed: { ...note } };
}

function terms(value: string): string[] {
  return [...new Set((value.toLowerCase().match(WORD) ?? []).filter((item) => item.length > 1))];
}

function scoreNote(note: MemoryNote, query: string, tokens: string[]): number {
  const hay = (note.text + " " + note.source + " " + note.kind).toLowerCase();
  const exact = query.trim().toLowerCase();
  let score = exact && hay.includes(exact) ? 20 : 0;
  for (const token of tokens) {
    if (note.text.toLowerCase().includes(token)) score += 5;
    else if (note.source.toLowerCase().includes(token)) score += 3;
    else if (note.kind.includes(token as MemoryKind)) score += 1;
  }
  return score;
}

function snippetFor(text: string, tokens: string[], max = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  const indexes = tokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0);
  const center = indexes.length ? Math.min(...indexes) : 0;
  const start = Math.max(0, Math.min(clean.length - max, center - Math.floor(max / 3)));
  const body = clean.slice(start, start + max).trim();
  return (start > 0 ? "…" : "") + body + (start + max < clean.length ? "…" : "");
}

export function searchMemory(
  dir: string,
  query: string,
  options: MemorySearchOptions = {},
): MemoryHit[] {
  const tokens = terms(query);
  if (!query.trim() || tokens.length === 0) return [];
  const kinds = options.kinds ? new Set(options.kinds) : null;
  const since = options.since ? Date.parse(options.since) : Number.NEGATIVE_INFINITY;
  const until = options.until ? Date.parse(options.until) : Number.POSITIVE_INFINITY;
  const limit = Math.max(1, Math.min(50, Math.trunc(options.limit ?? 8)));

  return readNotes(dir)
    .filter((note) => !kinds || kinds.has(note.kind))
    .filter((note) => {
      const time = Date.parse(note.at);
      return time >= since && time <= until;
    })
    .map((note) => ({ note, score: scoreNote(note, query, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.note.at) - Date.parse(a.note.at))
    .slice(0, limit)
    .map(({ note, score }) => ({ ...note, score, snippet: snippetFor(note.text, tokens) }));
}
