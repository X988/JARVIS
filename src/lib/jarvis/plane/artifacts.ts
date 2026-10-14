import fs from "node:fs";
import path from "node:path";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /(?:password|passwd|парол(?:ь|я)?|credential|secret|token|токен|api[_ -]?key|authorization)\s*[:=]\s*(?!\$\{|<[^>]+>|\[?redacted\]?|changeme|example|dummy)[^\s"',;}{]+/i,
];
const SENSITIVE_NAME =
  /(?:^|[._-])(?:secret|secrets|credential|credentials|token|tokens|private)(?:[._-]|$)|^(?:\.env(?:\..*)?|id_rsa|id_ed25519)$|\.(?:key|pem|p12|pfx)$/i;
const MAX_BYTES = 2_000_000;

function secretLike(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function lexicalArtifactPath(rootInput: string, relative: string): { root: string; full: string } | null {
  const root = path.resolve(rootInput);
  const full = path.resolve(root, relative);
  if (!relative || path.isAbsolute(relative)) return null;
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (relative.split(/[/\\]/).includes("..")) return null;
  return { root, full };
}

export function resolveArtifactFile(
  rootInput: string,
  relative: string,
): { ok: true; path: string } | { ok: false; code: "PATH" | "NOT_FOUND" | "SECRET" } {
  const lexical = lexicalArtifactPath(rootInput, relative);
  if (!lexical) return { ok: false, code: "PATH" };
  if (SENSITIVE_NAME.test(path.basename(relative))) return { ok: false, code: "SECRET" };
  if (!fs.existsSync(lexical.root) || !fs.existsSync(lexical.full)) return { ok: false, code: "NOT_FOUND" };
  try {
    if (!fs.statSync(lexical.root).isDirectory()) return { ok: false, code: "PATH" };
    if (fs.lstatSync(lexical.full).isSymbolicLink()) return { ok: false, code: "PATH" };
    const realRoot = fs.realpathSync(lexical.root);
    const realFile = fs.realpathSync(lexical.full);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) return { ok: false, code: "PATH" };
    if (!fs.statSync(realFile).isFile()) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, path: realFile };
  } catch {
    return { ok: false, code: "PATH" };
  }
}

export function deliverArtifact(input: {
  root: string;
  relative: string;
  bytes: number;
  text: string;
}): { ok: true; path: string } | { ok: false; code: "PATH" | "SIZE" | "SECRET" } {
  const lexical = lexicalArtifactPath(input.root, input.relative);
  if (!lexical) return { ok: false, code: "PATH" };
  if (SENSITIVE_NAME.test(path.basename(input.relative))) return { ok: false, code: "SECRET" };
  if (input.bytes > MAX_BYTES || input.bytes < 0) return { ok: false, code: "SIZE" };
  if (secretLike(input.text)) return { ok: false, code: "SECRET" };
  return { ok: true, path: lexical.full };
}
