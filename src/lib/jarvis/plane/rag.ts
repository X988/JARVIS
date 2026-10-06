import fs from "node:fs";
import path from "node:path";

export type Chunk = { source: string; at: string; text: string };

export function indexFolder(dir: string): Chunk[] {
  if (!fs.existsSync(dir)) return [];
  const chunks: Chunk[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md") && !name.endsWith(".txt")) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    const body = fs.readFileSync(full, "utf8");
    for (const piece of body.split(/\n\n+/)) {
      const text = piece.trim();
      if (text) chunks.push({ source: name, at: stat.mtime.toISOString(), text });
    }
  }
  return chunks;
}

export function searchChunks(chunks: Chunk[], query: string): Chunk[] {
  const needle = query.toLowerCase();
  return chunks.filter((chunk) => chunk.text.toLowerCase().includes(needle));
}
