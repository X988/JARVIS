import fs from "node:fs";
import path from "node:path";

type Bucket = Record<string, number[]>;

function file(): string {
  const dir = process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "rate.json");
}

function read(): Bucket {
  const target = file();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as Bucket;
  } catch {
    return {};
  }
}

export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const bucket = read();
  const fresh = (bucket[key] ?? []).filter((stamp) => now - stamp < windowMs);
  if (fresh.length >= limit) {
    bucket[key] = fresh;
    fs.writeFileSync(target, JSON.stringify(bucket));
    return false;
  }
  fresh.push(now);
  bucket[key] = fresh;
  fs.writeFileSync(target, JSON.stringify(bucket));
  return true;
}
