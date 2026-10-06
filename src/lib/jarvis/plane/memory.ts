import fs from "node:fs";
import path from "node:path";

export type MemoryKind = "conversation" | "infrastructure" | "incident" | "procedure" | "development" | "preference";

export type MemoryNote = {
  id: string;
  kind: MemoryKind;
  at: string;
  source: string;
  text: string;
};

const CRITICAL = /парол|credential|токен|\bip\b|роль сервера|environment|сопоставлен.*баз/i;

export function memoryFile(dir: string): string {
  return path.join(dir, "memory.jsonl");
}

export function remember(dir: string, note: MemoryNote): { ok: true } | { ok: false; code: "CRITICAL_FACT" } {
  if (note.kind === "infrastructure" && CRITICAL.test(note.text)) return { ok: false, code: "CRITICAL_FACT" };
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(memoryFile(dir), `${JSON.stringify(note)}\n`);
  return { ok: true };
}

export function searchMemory(dir: string, query: string): MemoryNote[] {
  const file = memoryFile(dir);
  if (!fs.existsSync(file)) return [];
  const needle = query.toLowerCase();
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryNote)
    .filter((note) => note.text.toLowerCase().includes(needle) || note.source.toLowerCase().includes(needle));
}
