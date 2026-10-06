import path from "node:path";

const SECRET = /password\s*=|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|api[_-]?key\s*[:=]/i;
const MAX_BYTES = 2_000_000;

export function deliverArtifact(input: {
  root: string;
  relative: string;
  bytes: number;
  text: string;
}): { ok: true; path: string } | { ok: false; code: "PATH" | "SIZE" | "SECRET" } {
  const root = path.resolve(input.root);
  const full = path.resolve(root, input.relative);
  if (full !== root && !full.startsWith(root + path.sep)) return { ok: false, code: "PATH" };
  if (input.relative.split(/[/\\]/).includes("..")) return { ok: false, code: "PATH" };
  if (input.bytes > MAX_BYTES || input.bytes < 0) return { ok: false, code: "SIZE" };
  if (SECRET.test(input.text)) return { ok: false, code: "SECRET" };
  return { ok: true, path: full };
}
