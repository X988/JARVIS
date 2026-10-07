import fs from "node:fs";
import path from "node:path";

export type Chunk = {
  source: string;
  at: string;
  text: string;
  offset: number;
  kind: string;
};

const TEXT_EXT = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".ts", ".tsx", ".js", ".mjs",
  ".cjs", ".py", ".sql", ".bsl", ".ps1", ".xml", ".ini", ".conf", ".log",
]);
const WORD = /[\p{L}\p{N}_-]+/gu;

function tokens(value: string): string[] {
  return [...new Set((value.toLowerCase().match(WORD) ?? []).filter((item) => item.length > 1))];
}

function kindFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".bsl") return "bsl";
  if (ext === ".ps1") return "powershell";
  if (ext === ".sql") return "sql";
  if ([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"].includes(ext)) return "code";
  if ([".json", ".yaml", ".yml", ".xml", ".ini", ".conf"].includes(ext)) return "config";
  if (ext === ".csv") return "csv";
  if (ext === ".md") return "markdown";
  return "text";
}

function filesUnder(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (out.length >= maxFiles) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= maxFiles) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return out;
}

function splitText(text: string, maxChars: number, overlap: number): Array<{ text: string; offset: number }> {
  const clean = text.replace(/\r\n/g, "\n");
  const out: Array<{ text: string; offset: number }> = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(clean.length, cursor + maxChars);
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf("\n\n", end);
      const line = clean.lastIndexOf("\n", end);
      const space = clean.lastIndexOf(" ", end);
      const boundary = Math.max(paragraph, line, space);
      if (boundary > cursor + Math.floor(maxChars * 0.55)) end = boundary;
    }
    const piece = clean.slice(cursor, end).trim();
    if (piece) out.push({ text: piece, offset: cursor });
    if (end >= clean.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return out;
}

export function indexFolder(
  dir: string,
  options: { maxFiles?: number; maxFileBytes?: number; chunkChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) return [];
  const maxFiles = Math.max(1, Math.min(2_000, Math.trunc(options.maxFiles ?? 500)));
  const maxFileBytes = Math.max(1_024, Math.min(10 * 1024 * 1024, Math.trunc(options.maxFileBytes ?? 2 * 1024 * 1024)));
  const chunkChars = Math.max(300, Math.min(4_000, Math.trunc(options.chunkChars ?? 1_400)));
  const overlap = Math.max(0, Math.min(500, Math.trunc(options.overlapChars ?? 160)));
  const chunks: Chunk[] = [];

  for (const full of filesUnder(root, maxFiles)) {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > maxFileBytes) continue;
    const body = fs.readFileSync(full, "utf8");
    const source = path.relative(root, full).split(path.sep).join("/");
    for (const piece of splitText(body, chunkChars, overlap)) {
      chunks.push({
        source,
        at: stat.mtime.toISOString(),
        text: piece.text,
        offset: piece.offset,
        kind: kindFor(full),
      });
    }
  }
  return chunks;
}

export function searchChunks(chunks: Chunk[], query: string, limit = 8): Chunk[] {
  const wanted = tokens(query);
  if (!wanted.length) return [];
  const cap = Math.max(1, Math.min(50, Math.trunc(limit)));
  return chunks
    .map((chunk) => {
      const hay = (chunk.text + " " + chunk.source + " " + chunk.kind).toLowerCase();
      let score = hay.includes(query.trim().toLowerCase()) ? 20 : 0;
      for (const token of wanted) {
        const matches = hay.split(token).length - 1;
        if (matches > 0) score += Math.min(12, matches * 3);
      }
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.chunk.at) - Date.parse(left.chunk.at))
    .slice(0, cap)
    .map((row) => row.chunk);
}
