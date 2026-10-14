import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendAudit, redactSecrets } from "../audit-log.ts";

/** Local knowledge base: Markdown → chunks → Ollama embeddings → top-k retrieval. */

export type Chunk = { id: string; source: string; heading: string; text: string };
export type IndexedChunk = Chunk & { vector: number[] };
export type Hit = Chunk & { score: number };
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

const CHUNK_CHARS = 900;
const SECRET_LIKE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?<![\p{L}\d])(password|passwd|pwd|пароль|token|токен|secret|секрет|api[_-]?key)(?![\p{L}\d])[^\n:=]{0,24}[:=]\s*\S{4,}/iu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/,
  /\b(sk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

export function looksSecret(text: string): boolean {
  return SECRET_LIKE.some((pattern) => pattern.test(text)) || redactSecrets(text) !== text;
}

export function knowledgeDirs(env: NodeJS.ProcessEnv = process.env, stateDir?: string): string[] {
  const base = env.JARVIS_KNOWLEDGE_DIR?.trim() || path.join(process.cwd(), "knowledge");
  const state = stateDir || env.JARVIS_STATE_DIR?.trim() || path.join(process.cwd(), "data");
  return [base, path.join(state, "knowledge")];
}

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/** Split by headings, then by paragraphs up to CHUNK_CHARS. Secret-like chunks are dropped. */
export function chunkMarkdown(source: string, markdown: string): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (!text || looksSecret(text)) return;
    const id = createHash("sha256").update(source + "\n" + heading + "\n" + text).digest("hex").slice(0, 16);
    chunks.push({ id, source, heading, text });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[1].trim();
      continue;
    }
    if (buffer.join("\n").length + line.length > CHUNK_CHARS && line.trim() === "") flush();
    else if (buffer.join("\n").length + line.length > CHUNK_CHARS * 1.5) flush();
    buffer.push(line);
  }
  flush();
  return chunks;
}

export function loadChunks(dirs: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const dir of dirs) {
    const root = path.dirname(dir);
    for (const file of listMarkdown(dir)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      chunks.push(...chunkMarkdown(rel, fs.readFileSync(file, "utf8")));
    }
  }
  return chunks;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function ollamaEmbedder(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): EmbedFn {
  const base = (env.JARVIS_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = env.JARVIS_EMBED_MODEL?.trim() || "nomic-embed-text";
  return async (texts) => {
    const response = await fetchImpl(`${base}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`embed http ${response.status}`);
    const body = (await response.json()) as { embeddings?: number[][] };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new Error("embed shape");
    return body.embeddings;
  };
}

type CacheFile = { model: string; vectors: Record<string, number[]> };

/** Embeds chunks, reusing a content-addressed cache in the state dir. */
export async function buildIndex(
  chunks: Chunk[],
  embed: EmbedFn,
  opts: { cacheFile?: string; model?: string } = {},
): Promise<IndexedChunk[]> {
  const model = opts.model || "nomic-embed-text";
  let cache: CacheFile = { model, vectors: {} };
  if (opts.cacheFile && fs.existsSync(opts.cacheFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(opts.cacheFile, "utf8")) as CacheFile;
      if (parsed.model === model && parsed.vectors) cache = parsed;
    } catch {
      // A corrupt cache is rebuilt.
    }
  }
  const missing = chunks.filter((chunk) => !cache.vectors[chunk.id]);
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16);
    const vectors = await embed(batch.map((chunk) => `search_document: ${chunk.heading}\n${chunk.text}`));
    batch.forEach((chunk, index) => {
      cache.vectors[chunk.id] = vectors[index];
    });
  }
  if (opts.cacheFile && missing.length) {
    const keep: Record<string, number[]> = {};
    for (const chunk of chunks) keep[chunk.id] = cache.vectors[chunk.id];
    fs.mkdirSync(path.dirname(opts.cacheFile), { recursive: true });
    fs.writeFileSync(opts.cacheFile, JSON.stringify({ model, vectors: keep }));
  }
  return chunks.map((chunk) => ({ ...chunk, vector: cache.vectors[chunk.id] }));
}

export async function retrieve(
  query: string,
  index: IndexedChunk[],
  embed: EmbedFn,
  opts: { k?: number; minScore?: number } = {},
): Promise<Hit[]> {
  if (!query.trim() || index.length === 0) return [];
  const [vector] = await embed([`search_query: ${query}`]);
  return index
    .map((chunk) => ({ id: chunk.id, source: chunk.source, heading: chunk.heading, text: chunk.text, score: cosine(vector, chunk.vector) }))
    .filter((hit) => hit.score >= (opts.minScore ?? 0.5))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k ?? 4);
}

/** High-level helper used by the agent: never throws; returns [] when disabled or Ollama is down. */
export async function retrieveKnowledge(
  query: string,
  opts: { env?: NodeJS.ProcessEnv; stateDir?: string; embed?: EmbedFn } = {},
): Promise<Hit[]> {
  const env = opts.env ?? process.env;
  if (env.JARVIS_KNOWLEDGE_ENABLED === "0") return [];
  try {
    const embed = opts.embed ?? ollamaEmbedder(env);
    const dirs = knowledgeDirs(env, opts.stateDir);
    const chunks = loadChunks(dirs);
    const index = await buildIndex(chunks, embed, {
      cacheFile: path.join(dirs[1], ".index-cache.json"),
      model: env.JARVIS_EMBED_MODEL?.trim() || "nomic-embed-text",
    });
    const k = Number(env.JARVIS_KNOWLEDGE_TOP_K) || 4;
    const minScore = Number(env.JARVIS_KNOWLEDGE_MIN_SCORE) || 0.5;
    return await retrieve(query, index, embed, { k, minScore });
  } catch {
    return [];
  }
}

export function formatSources(hits: Hit[]): string {
  const unique = [...new Set(hits.map((hit) => hit.source))];
  return unique.length ? `Источник: ${unique.join(", ")}` : "";
}

// ---- Confirmed knowledge append ----------------------------------------------------------

type Pending = { id: string; actor: string; text: string; expiresAt: number };
const PENDING_TTL_MS = 10 * 60_000;

function pendingFile(stateDir: string): string {
  return path.join(stateDir, "knowledge", ".pending.json");
}

function readPending(stateDir: string): Pending[] {
  try {
    const rows = JSON.parse(fs.readFileSync(pendingFile(stateDir), "utf8")) as Pending[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writePending(stateDir: string, rows: Pending[]): void {
  fs.mkdirSync(path.dirname(pendingFile(stateDir)), { recursive: true });
  fs.writeFileSync(pendingFile(stateDir), JSON.stringify(rows), { mode: 0o600 });
}

export type KnowledgeCommand =
  | { kind: "propose"; text: string }
  | { kind: "confirm"; id: string }
  | null;

export function parseKnowledgeCommand(input: string): KnowledgeCommand {
  const text = input.trim();
  const confirm = /^подтверди(?:ть)?\s+знание\s+([a-f0-9]{6})\b/i.exec(text) || /^confirm\s+knowledge\s+([a-f0-9]{6})\b/i.exec(text);
  if (confirm) return { kind: "confirm", id: confirm[1].toLowerCase() };
  const propose = /^(?:запомни|добавь в базу знаний|remember)\s*[:,—-]?\s*([\s\S]+)$/i.exec(text);
  if (propose && propose[1].trim()) return { kind: "propose", text: propose[1].trim() };
  return null;
}

export type KnowledgeAppendResult = { code: string; answer: string; auditId?: string };

export function proposeKnowledge(
  text: string,
  actor: string,
  stateDir: string,
  now = Date.now(),
): KnowledgeAppendResult {
  if (text.length > 2000) return { code: "SCHEMA_INVALID", answer: "Слишком длинная заметка (максимум 2000 символов)." };
  if (looksSecret(text)) return { code: "POLICY_DENIED", answer: "Похоже на секрет (пароль, токен или ключ). В базу знаний не записываю." };
  const id = randomBytes(3).toString("hex");
  const rows = readPending(stateDir).filter((row) => row.expiresAt > now);
  rows.push({ id, actor, text, expiresAt: now + PENDING_TTL_MS });
  writePending(stateDir, rows);
  return {
    code: "APPROVAL_REQUIRED",
    answer: `Записать в базу знаний: «${text}». Для подтверждения скажите или напишите: «подтверди знание ${id}» (действует 10 минут).`,
  };
}

export function confirmKnowledge(
  id: string,
  actor: string,
  stateDir: string,
  now = new Date(),
): KnowledgeAppendResult {
  const rows = readPending(stateDir);
  const row = rows.find((item) => item.id === id);
  if (!row || row.expiresAt <= now.getTime()) return { code: "APPROVAL_EXPIRED", answer: "Нет такой ожидающей записи или срок подтверждения истёк." };
  if (row.actor !== actor) return { code: "APPROVAL_MISMATCH", answer: "Подтвердить может только тот, кто предложил запись." };
  if (looksSecret(row.text)) return { code: "POLICY_DENIED", answer: "Похоже на секрет. Не записываю." };
  const hash = createHash("sha256").update(row.text).digest("hex");
  // Audit first: if the chain is broken, nothing is written to the knowledge base.
  const audit = appendAudit(
    {
      at: now.toISOString(),
      executionId: `knowledge-${id}`,
      actor,
      action: "knowledge.append",
      verdict: "allow",
      normalized: `knowledge.append sha256=${hash.slice(0, 16)} chars=${row.text.length}`,
      target: "knowledge/learned.md",
      approvalId: id,
      result: "OK",
      channel: "agent",
    },
    stateDir,
  );
  const file = path.join(stateDir, "knowledge", "learned.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "# Learned notes\n\nOperator-confirmed notes. Each entry has an audit row.\n");
  fs.appendFileSync(file, `\n## ${now.toISOString().slice(0, 10)} (${actor}, audit ${audit.hash?.slice(0, 12)})\n${row.text}\n`);
  writePending(stateDir, rows.filter((item) => item.id !== id));
  return { code: "OK", answer: "Записал в базу знаний (knowledge/learned.md). Запись в журнале аудита создана.", auditId: audit.hash };
}
