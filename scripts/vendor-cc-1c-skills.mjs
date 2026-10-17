/**
 * Build the JARVIS 1C skill pack from a local checkout of
 * https://github.com/Nikolay-Shirokov/cc-1c-skills
 *
 * Copies Markdown only. PowerShell, Python, Node hooks and web-test runners
 * are recorded in UPSTREAM.json and are not written into the pack.
 *
 * Usage: node scripts/vendor-cc-1c-skills.mjs /path/to/cc-1c-skills
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COMMIT = "24429b462509d0ae92e45bc22a7ccae159f7b904";
const NOTICE =
  "JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.";

const EXEC_LANG = new Set([
  "powershell",
  "ps1",
  "pwsh",
  "bash",
  "sh",
  "shell",
  "zsh",
  "cmd",
  "bat",
  "python",
  "py",
  "javascript",
  "js",
  "node",
  "console",
]);

const EXEC_LINE =
  /powershell(?:\.exe)?|\bpwsh\b|\b1cv8\b|ibcmd|CLAUDE_SKILL_DIR|\.ps1\b|\.py\b|node\s+\$RUN|npx\s+playwright|python3?\s+\S+|browser\.mjs|run\.mjs|writeFileSync|readFileSync|other shells|run_in_background|WEB_TEST_|\/N"<user>"|\/P"<password>"|\/ConfigurationRepository/i;

const SECRET_LIKE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?<![\p{L}\d])(password|passwd|pwd|пароль|token|токен|secret|секрет|api[_-]?key)(?![\p{L}\d])[^\n:=]{0,24}[:=]\s*\S{4,}/iu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/,
  /\b(sk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(password|passwd|secret|api[_-]?key|token|authorization)\b\s*[:=]\s*\S+/i,
];

function looksSecret(text) {
  return SECRET_LIKE.some((pattern) => pattern.test(text));
}

function scrubSecrets(text) {
  let next = text;
  next = next.replaceAll("Тип-токен", "Тип-идентификатор");
  next = next.replaceAll("позиционный токен:", "позиционный фрагмент:");
  next = next.replaceAll("{ \"input\": \"Пароль\", \"path\": \"Пароль\", \"passwordMode\": true }", "{ \"input\": \"СекретВвода\", \"path\": \"СекретВвода\", \"passwordMode\": true }");
  next = next.replace(/Pwd=&quot;[^&]*&quot;/gi, "auth-omitted");
  next = next.replace(/\bsk-[A-Za-z0-9_-]*/g, "[credential omitted]");
  for (let i = 0; i < 8 && looksSecret(next); i += 1) {
    next = next.replace(
      /(?<![\p{L}\d])(password|passwd|pwd|пароль|token|токен|secret|секрет|api[_-]?key)(?![\p{L}\d])[^\n:=]{0,24}[:=]\s*\S{4,}/iu,
      "[credential omitted]",
    );
    next = next.replace(/\b(password|passwd|secret|api[_-]?key|token|authorization)\b\s*[:=]\s*\S+/gi, "[credential omitted]");
    next = next.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}/g, "[credential omitted]");
    next = next.replace(/\b(sk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_]{16,}/g, "[credential omitted]");
    next = next.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[credential omitted]");
  }
  return next;
}

function stripExecutable(text) {
  const withoutFences = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (full, lang, body) => {
    const name = String(lang).trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (EXEC_LANG.has(name) || (!name && EXEC_LINE.test(body))) {
      return `> ${NOTICE}`;
    }
    return full;
  });
  return withoutFences
    .split(/\r?\n/)
    .filter((line) => !EXEC_LINE.test(line))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: raw };
  const yaml = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const name = /^name:\s*(.+)$/m.exec(yaml)?.[1]?.trim() ?? "";
  const description = /^description:\s*(.+)$/m.exec(yaml)?.[1]?.trim() ?? "";
  const tools = [...yaml.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((match) => match[1]);
  return { meta: { name, description, tools }, body };
}

function banner(kind, id) {
  return [
    `> ${NOTICE}`,
    `> Source: cc-1c-skills \`${COMMIT.slice(0, 12)}\` (${kind}${id ? ` \`${id}\`` : ""}). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.`,
    "> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.",
    "",
  ].join("\n");
}

function adaptMarkdown(raw, kind, id) {
  const { meta, body } = parseFrontmatter(raw);
  const lead = meta.description ? `${meta.description}\n\n` : "";
  return scrubSecrets(`${banner(kind, id)}${lead}${stripExecutable(body)}`.trim() + "\n");
}

function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "scripts") continue;
      out.push(...listMd(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function scriptFiles(dir) {
  const scripts = path.join(dir, "scripts");
  if (!fs.existsSync(scripts)) return [];
  const out = [];
  for (const entry of fs.readdirSync(scripts, { withFileTypes: true })) {
    const full = path.join(scripts, entry.name);
    if (entry.isDirectory()) {
      for (const nested of fs.readdirSync(full)) out.push(path.posix.join("scripts", entry.name, nested));
    } else out.push(path.posix.join("scripts", entry.name));
  }
  return out.sort();
}

function reasonFor(scripts, tools) {
  if (scripts.some((file) => file.includes("run.mjs") || file.endsWith(".mjs"))) {
    return "Upstream web-test runners drive a browser via Node/Playwright. Not installed and not connected to the JARVIS browser workbench.";
  }
  if (scripts.length > 0) {
    return "Upstream PowerShell/Python scripts call 1C Designer, ibcmd, or rewrite configuration files. Not installed. Not a JARVIS runbook.";
  }
  if (tools.some((tool) => /bash|write|edit|powershell/i.test(tool))) {
    return "No upstream script file, but the skill declares write or shell tools. JARVIS does not grant those tools.";
  }
  return "Documentation skill. JARVIS loads the text as prompt context and does not add a tool.";
}

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/vendor-cc-1c-skills.mjs <checkout>");
  process.exit(1);
}
const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (commit !== COMMIT) {
  console.error(`refusing to vendor ${commit}; pinned commit is ${COMMIT}`);
  process.exit(1);
}

const destRoot = path.join(process.cwd(), "vendor", "cc-1c-skills");
fs.rmSync(destRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(destRoot, "text"), { recursive: true });
fs.copyFileSync(path.join(source, "LICENSE"), path.join(destRoot, "LICENSE"));

const skillsRoot = path.join(source, ".claude", "skills");
const skillIds = fs
  .readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const skills = [];
const flagged = [];

for (const id of skillIds) {
  const dir = path.join(skillsRoot, id);
  const scripts = scriptFiles(dir);
  const rawSkill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  const { meta } = parseFrontmatter(rawSkill);
  skills.push({
    id,
    description: meta.description || "",
    execution: "docs-only",
    upstreamScripts: scripts,
    declaredTools: meta.tools,
    reason: reasonFor(scripts, meta.tools),
  });
  for (const file of listMd(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    const adapted = adaptMarkdown(fs.readFileSync(file, "utf8"), "skill", id);
    if (looksSecret(adapted) || EXEC_LINE.test(adapted)) flagged.push(`skills/${id}/${rel}`);
    const out = path.join(destRoot, "text", "skills", id, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, adapted);
  }
}

const excludedDocs = new Set(["python-porting-guide.md"]);
for (const file of listMd(path.join(source, "docs"))) {
  const name = path.basename(file);
  if (excludedDocs.has(name)) continue;
  const adapted = adaptMarkdown(fs.readFileSync(file, "utf8"), "guide", "");
  if (looksSecret(adapted) || EXEC_LINE.test(adapted)) flagged.push(`docs/${name}`);
  const out = path.join(destRoot, "text", "docs", name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, adapted);
}

if (flagged.length) {
  console.error("sanitizer left executable or secret-like text:");
  for (const item of flagged) console.error(" ", item);
  process.exit(1);
}

const upstream = {
  name: "cc-1c-skills",
  upstream: "https://github.com/Nikolay-Shirokov/cc-1c-skills",
  commit: COMMIT,
  license: "MIT",
  copyright: "Copyright (c) 2025-2026 Nick Shirokov",
  retrieved: "2026-10-15",
  adaptation:
    "Markdown skill and guide texts only, modified to drop shell/Designer/browser command blocks and credential examples. JARVIS loads them as prompt and lexical RAG context. No script, hook, or installer is vendored or executable.",
  execution: "docs-only",
  skills,
  excluded: [
    {
      path: ".claude/skills/*/scripts/**",
      reason: "PowerShell and Python entrypoints for 1C Designer, ibcmd, file rewrite, and EPF/CF load. Not mapped to a JARVIS runbook and not given shell access.",
    },
    {
      path: ".claude/skills/web-test/scripts/**",
      reason: "Node/Playwright automation of a 1C web client, including session control and screen recording. Not connected to the JARVIS browser workbench.",
    },
    {
      path: "hooks/**",
      reason: "Claude Code PreToolUse/PostToolUse hooks spawn node (support-guard.mjs, skill-suggester.mjs).",
    },
    {
      path: "scripts/switch.py",
      reason: "Installer that copies or symlinks skills into an agent configuration directory.",
    },
    {
      path: "scripts/switch-to-powershell.py",
      reason: "Rewrites the pack onto the PowerShell runtime.",
    },
    {
      path: "scripts/switch-to-python.py",
      reason: "Rewrites the pack onto the Python runtime.",
    },
    {
      path: "tests/**",
      reason: "Upstream test harness, not operator knowledge.",
    },
    {
      path: ".v8-xsd/**",
      reason: "Platform schema payload. The fetch skill text is kept; the fetch script is not.",
    },
    {
      path: "requirements.txt",
      reason: "Dependencies for the excluded Python scripts.",
    },
    {
      path: "docs/python-porting-guide.md",
      reason: "How to port and execute the skill scripts. Execution guidance is out of scope.",
    },
  ],
};

fs.writeFileSync(path.join(destRoot, "UPSTREAM.json"), JSON.stringify(upstream, null, 2) + "\n");
fs.writeFileSync(
  path.join(destRoot, "README.md"),
  `# 1C skill pack (documentation only)

Vendored from [cc-1c-skills](https://github.com/Nikolay-Shirokov/cc-1c-skills) at \`${COMMIT}\`.

License: MIT. ${upstream.copyright}. The full permission notice is in [LICENSE](./LICENSE).

JARVIS does not install or run the upstream PowerShell, Python, Designer, ibcmd, hook, or Playwright scripts. \`text/\` is prompt context for the bounded agent. A change to a 1C infobase still has to be a registered runbook that passes policy and approval.

Regenerate with \`node scripts/vendor-cc-1c-skills.mjs <checkout>\` only when the pinned commit in that script is updated on purpose.
`,
);

const scriptCount = skills.reduce((sum, skill) => sum + skill.upstreamScripts.length, 0);
console.log(`vendored ${skills.length} skills, excluded ${scriptCount} upstream script paths, flagged ${flagged.length}`);
