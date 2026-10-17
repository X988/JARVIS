import fs from "node:fs";
import path from "node:path";

export type Chunk = {
  source: string;
  at: string;
  text: string;
  offset: number;
  kind: string;
  roles?: string[];
  untrusted?: boolean;
  startLine?: number;
};

const TEXT_EXT = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".ts", ".tsx", ".js", ".mjs",
  ".cjs", ".py", ".sql", ".bsl", ".ps1", ".xml", ".ini", ".conf", ".log", ".rsc", ".pdf",
]);
const WORD = /[\p{L}\p{N}_-]+/gu;
const SENSITIVE_NAME = /(?:^|[._-])(?:secret|secrets|credential|credentials|token|tokens|private)(?:[._-]|$)|\.(?:key|p12|pfx)$/i;
const SECRET_CONTENT = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /(?:password|passwd|парол(?:ь|я)?|credential|secret|token|токен|api[_ -]?key|authorization)["']?\s*[:=]\s*["']?(?!\$\{|<[^>]+>|\[?redacted\]?|changeme|example|dummy)[^\s"',;}{]+/i,
];

function containsSecretLike(text: string): boolean {
  return SECRET_CONTENT.some((pattern) => pattern.test(text));
}

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
  if (ext === ".rsc") return "mikrotik";
  if (ext === ".pdf") return "pdf";
  return "text";
}

const INJECTION = /ignore (all|any|previous)|disregard (the )?(rules|policy)|you are now|override (the )?policy|system prompt/i;

export function extractPdfText(raw: string): string {
  const parts: string[] = [];
  const pattern = /\((?:\\\)|\\.|[^\\)]){1,500}\)/g;
  for (const match of raw.matchAll(pattern)) {
    const inner = match[0].slice(1, -1).replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
    if (/[\p{L}\p{N}]/u.test(inner)) parts.push(inner);
  }
  return parts.join(" ").slice(0, 200_000);
}

function filesUnder(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (out.length >= maxFiles) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= maxFiles) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || SENSITIVE_NAME.test(entry.name)) continue;
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
  options: {
    maxFiles?: number;
    maxFileBytes?: number;
    chunkChars?: number;
    overlapChars?: number;
    rolesFor?: (source: string) => string[];
  } = {},
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
    const raw = fs.readFileSync(full);
    const body = path.extname(full).toLowerCase() === ".pdf" ? extractPdfText(raw.toString("latin1")) : raw.toString("utf8");
    if (!body.trim() || containsSecretLike(body)) continue;
    const source = path.relative(root, full).split(path.sep).join("/");
    const roles = options.rolesFor?.(source) ?? ["admin", "operator", "viewer"];
    for (const piece of splitText(body, chunkChars, overlap)) {
      chunks.push({
        source,
        at: stat.mtime.toISOString(),
        text: piece.text,
        offset: piece.offset,
        kind: kindFor(full),
        roles,
        untrusted: INJECTION.test(piece.text),
        startLine: body.slice(0, piece.offset).split("\n").length,
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

export function searchKnowledge(
  chunks: Chunk[],
  query: string,
  options: { limit?: number; role?: string; kind?: string; since?: string; until?: string } = {},
): Chunk[] {
  const role = options.role ?? "operator";
  const since = options.since ? Date.parse(options.since) : Number.NEGATIVE_INFINITY;
  const until = options.until ? Date.parse(options.until) : Number.POSITIVE_INFINITY;
  return searchChunks(chunks, query, options.limit ?? 8).filter((chunk) => {
    const roles = chunk.roles ?? ["admin", "operator", "viewer"];
    if (!roles.includes(role) && role !== "admin") return false;
    if (options.kind && chunk.kind !== options.kind) return false;
    const at = Date.parse(chunk.at);
    return at >= since && at <= until;
  });
}

export function knowledgeMayChangePolicy(_chunk: Chunk): false {
  return false;
}

export function citeChunk(chunk: Chunk): string {
  const trust = chunk.untrusted ? "недоверенный фрагмент" : "фрагмент";
  return `${trust}: ${chunk.source}:${chunk.startLine ?? chunk.offset}`;
}

type IndexFile = { files: Record<string, { mtimeMs: number; size: number }>; chunks: Chunk[] };

export function syncKnowledgeIndex(
  dir: string,
  indexPath: string,
  options: Parameters<typeof indexFolder>[1] = {},
): Chunk[] {
  const root = path.resolve(dir);
  let previous: IndexFile = { files: {}, chunks: [] };
  if (fs.existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as IndexFile;
      if (parsed && parsed.files && Array.isArray(parsed.chunks)) previous = parsed;
    } catch {
      previous = { files: {}, chunks: [] };
    }
  }
  const fresh = indexFolder(root, options);
  const sources = [...new Set(fresh.map((chunk) => chunk.source))];
  const unchanged = new Set<string>();
  const files: IndexFile["files"] = {};
  for (const source of sources) {
    const full = path.join(root, source);
    const stat = fs.statSync(full);
    files[source] = { mtimeMs: stat.mtimeMs, size: stat.size };
    const old = previous.files[source];
    if (old && old.mtimeMs === stat.mtimeMs && old.size === stat.size) unchanged.add(source);
  }
  const chunks = [
    ...previous.chunks.filter((chunk) => unchanged.has(chunk.source)),
    ...fresh.filter((chunk) => !unchanged.has(chunk.source)),
  ];
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const temp = `${indexPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ files, chunks }));
  fs.renameSync(temp, indexPath);
  return chunks;
}
