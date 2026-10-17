import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOTS = ["src"];
const SOURCE_RULES = [
  // Only real child_process.exec/execSync, not RegExp.exec or pg.exec
  { id: "child-process-exec", pattern: /(?:from\s+["']node:child_process["']|require\s*\(\s*["']node:child_process["']\)|child_process\.)[^;]*\bexec(?:Sync)?\s*\(/ },
  { id: "shell-true", pattern: /\bshell\s*:\s*true\b/ },
  { id: "ssh-hostkey-disabled", pattern: /StrictHostKeyChecking\s*=\s*no/i },
  { id: "ssh-hostkey-accept-new", pattern: /StrictHostKeyChecking\s*=\s*accept-new/i },
  { id: "tls-verification-disabled", pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/i },
  { id: "tls-insecure-config", pattern: /rejectUnauthorized\s*:\s*!\s*config\.tlsInsecure/ },
  { id: "direct-main-push", pattern: /\bgit\s+push\b[^\n]*(?:\bmain\b|\bmaster\b)/i },
];

function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.isFile() &&
        /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
        !/\.(?:test|spec)\.[^.]+$/.test(entry.name)
      ) out.push(full);
    }
  };
  for (const relative of SOURCE_ROOTS) {
    const dir = path.join(root, relative);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out;
}

export function scanSourceText(text) {
  return SOURCE_RULES.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);
}

export function scanWorkflowText(text) {
  const findings = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if (match && !/@[a-f0-9]{40}$/i.test(match[1])) {
      findings.push("mutable-action-ref");
    }
  }
  if (/\bpull_request_target\s*:/m.test(text)) findings.push("pull-request-target");
  return findings;
}

export function scanRepository(root = process.cwd()) {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(file, "utf8");
    for (const kind of scanSourceText(text)) {
      findings.push({ file: path.relative(root, file), kind });
    }
  }
  const workflowDir = path.join(root, ".github", "workflows");
  if (fs.existsSync(workflowDir)) {
    for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      const file = path.join(workflowDir, entry.name);
      const text = fs.readFileSync(file, "utf8");
      for (const kind of scanWorkflowText(text)) {
        findings.push({ file: path.relative(root, file), kind });
      }
    }
  }
  return findings;
}

function main() {
  const findings = scanRepository();
  if (!findings.length) {
    process.stdout.write("security policy scan: no findings\n");
    return;
  }
  for (const finding of findings) {
    process.stderr.write(`security policy scan: ${finding.file}: ${finding.kind}\n`);
  }
  process.exitCode = 1;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) main();
