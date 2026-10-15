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

export type MemoryConfidence = "observed" | "hypothesis" | "confirmed";
export type MemoryVisibility = "viewer" | "operator" | "admin";

export type MemoryNote = {
  id: string;
  kind: MemoryKind;
  at: string;
  source: string;
  text: string;
  confidence?: MemoryConfidence;
  actorId?: string;
  visibility?: MemoryVisibility;
  system?: string;
  origin?: string;
  expiresAt?: string | null;
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
  system?: string;
  readerRole?: "viewer" | "operator" | "admin" | "none";
  includeExpired?: boolean;
};

const MEMORY_KINDS = new Set<MemoryKind>([
  "conversation",
  "infrastructure",
  "incident",
  "procedure",
  "development",
  "preference",
]);
const SECRET =
  /(?:password|парол|credential|secret|token|токен|api[_ -]?key|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]?/i;
const CRITICAL_INFRA =
  /(?:\bip\b|ip[- ]?address|адрес\s+сервера|роль\s+сервера|server\s+role|environment|окружени|db\s*mapping|сопоставлен.*баз|production\s+database)/i;
const WORD = /[\p{L}\p{N}_-]+/gu;

export function memoryFile(dir: string): string {
  return path.join(dir, "memory.jsonl");
}

function validNote(value: unknown): value is MemoryNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const note = value as Partial<MemoryNote>;
  return (
    typeof note.id === "string" &&
    /^[A-Za-z0-9._:-]{1,96}$/.test(note.id) &&
    typeof note.kind === "string" &&
    MEMORY_KINDS.has(note.kind as MemoryKind) &&
    typeof note.at === "string" &&
    Number.isFinite(Date.parse(note.at)) &&
    typeof note.source === "string" &&
    Boolean(note.source.trim()) &&
    note.source.length <= 500 &&
    typeof note.text === "string" &&
    Boolean(note.text.trim()) &&
    note.text.length <= 20_000
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

const CONFIDENCE = new Set<MemoryConfidence>(["observed", "hypothesis", "confirmed"]);
const VISIBILITY = new Set<MemoryVisibility>(["viewer", "operator", "admin"]);

function cleanNote(note: MemoryNote): MemoryNote | null {
  if (!validNote(note)) return null;
  if (note.confidence !== undefined && !CONFIDENCE.has(note.confidence)) return null;
  if (note.visibility !== undefined && !VISIBILITY.has(note.visibility)) return null;
  if (note.actorId !== undefined && !/^[A-Za-z0-9._:-]{1,96}$/.test(note.actorId)) return null;
  if (note.system !== undefined && !/^[a-z0-9._:-]{1,64}$/.test(note.system)) return null;
  if (note.origin !== undefined && (note.origin.length > 200 || !note.origin.trim())) return null;
  if (note.expiresAt !== undefined && note.expiresAt !== null && !Number.isFinite(Date.parse(note.expiresAt))) return null;
  return note;
}

function llmCannotConfirm(note: MemoryNote): boolean {
  return note.confidence === "confirmed" && /^(llm|model)[:/]/i.test(note.source + " " + (note.origin ?? ""));
}

export function remember(
  dir: string,
  note: MemoryNote,
): { ok: true } | { ok: false; code: "CRITICAL_FACT" | "SECRET" | "INVALID" | "DUPLICATE" | "UNCONFIRMED" } {
  const clean = cleanNote(note);
  if (!clean) return { ok: false, code: "INVALID" };
  if (llmCannotConfirm(clean)) return { ok: false, code: "UNCONFIRMED" };
  if (SECRET.test(clean.text)) return { ok: false, code: "SECRET" };
  if (clean.kind === "infrastructure" && CRITICAL_INFRA.test(clean.text)) {
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

function tokenHit(hay: string, token: string): boolean {
  if (hay.includes(token)) return true;
  if (token.length < 5) return false;
  const stem = token.slice(0, 4);
  return hay.split(/[^\p{L}\p{N}_-]+/u).some((word) => word.length >= 4 && (word.startsWith(stem) || token.startsWith(word.slice(0, 4))));
}

function scoreNote(note: MemoryNote, query: string, tokens: string[]): number {
  const hay = (note.text + " " + note.source + " " + note.kind).toLowerCase();
  const exact = query.trim().toLowerCase();
  let score = exact && hay.includes(exact) ? 20 : 0;
  for (const token of tokens) {
    if (tokenHit(note.text.toLowerCase(), token)) score += 5;
    else if (tokenHit(note.source.toLowerCase(), token)) score += 3;
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

  const roleRank: Record<string, number> = { viewer: 1, operator: 2, admin: 3, none: 0 };
  const reader = options.readerRole ? roleRank[options.readerRole] ?? 0 : 3;
  const now = Date.now();
  return readNotes(dir)
    .filter((note) => !kinds || kinds.has(note.kind))
    .filter((note) => !options.system || note.system === options.system)
    .filter((note) => {
      const required = roleRank[note.visibility ?? "viewer"] ?? 1;
      return reader >= required;
    })
    .filter((note) => options.includeExpired || !note.expiresAt || Date.parse(note.expiresAt) > now)
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

function writeNotes(dir: string, notes: MemoryNote[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = memoryFile(dir);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, notes.map((note) => JSON.stringify(note)).join("\n") + (notes.length ? "\n" : ""));
  fs.renameSync(temp, target);
}

export function forgetMemory(dir: string, id: string): { ok: boolean } {
  return withStateLock(dir, () => {
    const notes = readNotes(dir);
    const next = notes.filter((note) => note.id !== id);
    if (next.length === notes.length) return { ok: false };
    writeNotes(dir, next);
    return { ok: true };
  });
}

export function redactMemory(dir: string, id: string): { ok: boolean } {
  return withStateLock(dir, () => {
    const notes = readNotes(dir);
    const note = notes.find((item) => item.id === id);
    if (!note) return { ok: false };
    note.text = "[redacted]";
    note.source = "redacted";
    writeNotes(dir, notes);
    return { ok: true };
  });
}

export function purgeExpiredMemory(dir: string, now = Date.now()): number {
  return withStateLock(dir, () => {
    const notes = readNotes(dir);
    const kept = notes.filter((note) => !note.expiresAt || Date.parse(note.expiresAt) > now);
    if (kept.length !== notes.length) writeNotes(dir, kept);
    return notes.length - kept.length;
  });
}

export function hybridSearch(
  dir: string,
  query: string,
  vectors: Array<{ id: string; vector: number[] }> = [],
  options: MemorySearchOptions = {},
): MemoryHit[] {
  const keyword = searchMemory(dir, query, options);
  if (!vectors.length) return keyword.map((hit) => ({ ...hit, score: hit.score }));
  const byId = new Map(vectors.map((item) => [item.id, item.vector]));
  const queryVector = byId.get("__query");
  if (!queryVector) return keyword;
  return keyword
    .map((hit) => {
      const vector = byId.get(hit.id);
      const cosine = vector ? cosineSimilarity(queryVector, vector) : 0;
      return { ...hit, score: hit.score + cosine * 10 };
    })
    .sort((left, right) => right.score - left.score);
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function memoryRowsForMigration(dir: string): MemoryNote[] {
  return readNotes(dir).map((note) => ({ ...note }));
}

export async function importMemoryRows(
  notes: MemoryNote[],
  exec: (sql: string, params: unknown[]) => Promise<void>,
): Promise<{ imported: number }> {
  let imported = 0;
  for (const note of notes) {
    if (!validNote(note) || SECRET.test(note.text)) continue;
    await exec(
      "insert into jarvis_memory (id, kind, at, source, text, confidence, visibility, system, origin) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        note.id,
        note.kind,
        note.at,
        note.source,
        note.text,
        note.confidence ?? "observed",
        note.visibility ?? "operator",
        note.system ?? "",
        note.origin ?? note.source,
      ],
    );
    imported += 1;
  }
  return { imported };
}
