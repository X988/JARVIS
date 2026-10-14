import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS = [
  { id: "private-key", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ },
  { id: "github-pat", pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/ },
  { id: "github-fine-grained-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/ },
  { id: "openai-api-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

const ALLOWED_ENV_TEMPLATES = new Set([".env.example", ".env.sample", ".env.template"]);

export function isSensitiveTrackedPath(file) {
  const normalized = file.replaceAll("\\", "/");
  const base = path.posix.basename(normalized).toLowerCase();
  if (base === ".env" || (base.startsWith(".env.") && !ALLOWED_ENV_TEMPLATES.has(base))) return true;
  if (base === "id_rsa" || base === "id_ed25519" || base.endsWith(".p12") || base.endsWith(".pfx") || base.endsWith(".key")) {
    return true;
  }
  return false;
}

export function scanText(text) {
  return PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);
}

export function scanTrackedRepository(root = process.cwd()) {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const files = raw.split("\0").filter(Boolean);
  const findings = [];

  for (const file of files) {
    if (isSensitiveTrackedPath(file)) {
      findings.push({ file, kind: "sensitive-file" });
      continue;
    }

    const absolute = path.join(root, file);
    let buffer;
    try {
      buffer = fs.readFileSync(absolute);
    } catch {
      findings.push({ file, kind: "unreadable-tracked-file" });
      continue;
    }
    if (buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)) continue;

    const text = buffer.toString("utf8");
    for (const kind of scanText(text)) findings.push({ file, kind });
  }

  return findings;
}

function main() {
  const findings = scanTrackedRepository();
  if (!findings.length) {
    process.stdout.write("secret scan: no high-confidence findings\n");
    return;
  }
  for (const finding of findings) {
    process.stderr.write(`secret scan: ${finding.file}: ${finding.kind}\n`);
  }
  process.exitCode = 1;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) main();
