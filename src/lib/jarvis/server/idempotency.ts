import fs from "node:fs";
import path from "node:path";

export function rememberRequest<T>(dir: string, requestId: string, produce: () => T): { duplicate: boolean; value: T } {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "idempotency.json");
  const all = fs.existsSync(target) ? (JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, T>) : {};
  if (Object.prototype.hasOwnProperty.call(all, requestId)) return { duplicate: true, value: all[requestId] };
  const value = produce();
  all[requestId] = value;
  fs.writeFileSync(target, JSON.stringify(all));
  return { duplicate: false, value };
}
