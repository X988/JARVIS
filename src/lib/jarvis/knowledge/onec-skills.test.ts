import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { validateAgentPlan } from "../plane/agent-planner.ts";
import { runAgentTurn } from "../plane/agent-runtime.ts";
import { listTools } from "../plane/tool-registry.ts";
import { looksSecret } from "./rag.ts";
import { isOnecSkillQuery, loadOnecSkillCatalog, onecSkillHits, ONEC_SKILL_NOTICE, ONEC_SKILL_PROMPT_RULE } from "./onec-skills.ts";

const PACK = path.join(process.cwd(), "vendor", "cc-1c-skills");
const PINNED = "24429b462509d0ae92e45bc22a7ccae159f7b904";

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

describe("1C skill pack", () => {
  it("pins the MIT upstream and keeps every skill documentation-only", () => {
    const catalog = loadOnecSkillCatalog();
    assert.ok(catalog);
    assert.equal(catalog.commit, PINNED);
    assert.equal(catalog.license, "MIT");
    assert.match(catalog.copyright, /Nick Shirokov/);
    assert.equal(catalog.execution, "docs-only");
    assert.equal(catalog.skills.length, 81);
    assert.ok(catalog.skills.every((skill) => skill.execution === "docs-only"));
    assert.ok(catalog.skills.filter((skill) => skill.upstreamScripts.length > 0).length >= 70);
    const license = fs.readFileSync(path.join(PACK, "LICENSE"), "utf8");
    assert.match(license, /MIT License/);
    assert.match(license, /Copyright \(c\) 2025-2026 Nick Shirokov/);
    assert.match(license, /Permission is hereby granted/);
  });

  it("vendors markdown only and does not include upstream scripts or hooks", () => {
    const files = walk(PACK);
    const bad = files.filter((file) => /\.(ps1|py|mjs|js|exe|bat|cmd|sh)$/i.test(file));
    assert.deepEqual(bad, []);
    assert.equal(files.some((file) => file.endsWith(`${path.sep}hooks.json`)), false);
    const catalog = loadOnecSkillCatalog();
    assert.ok(catalog);
    for (const skill of catalog.skills) {
      assert.equal(fs.existsSync(path.join(PACK, "text", "skills", skill.id, "SKILL.md")), true, skill.id);
      for (const script of skill.upstreamScripts) {
        assert.equal(fs.existsSync(path.join(PACK, "text", "skills", skill.id, script)), false, script);
      }
    }
  });

  it("prompt texts do not look like secrets and do not carry shell entrypoints", () => {
    const markdown = walk(path.join(PACK, "text")).filter((file) => file.endsWith(".md"));
    assert.ok(markdown.length > 80);
    for (const file of markdown) {
      const text = fs.readFileSync(file, "utf8");
      assert.equal(looksSecret(text), false, file);
      assert.equal(/powershell(?:\.exe)?|\.ps1\b|\b1cv8\b|ibcmd|CLAUDE_SKILL_DIR|writeFileSync/i.test(text), false, file);
      assert.match(text, /JARVIS_ONEC_SKILL_DOCS_ONLY/);
      assert.match(text, /Nick Shirokov/);
    }
  });

  it("does not register skill ids as runbooks and rejects a script tool in the planner", () => {
    const catalog = loadOnecSkillCatalog();
    assert.ok(catalog);
    const names = new Set(listTools().map((tool) => tool.name));
    for (const skill of catalog.skills) assert.equal(names.has(skill.id), false, skill.id);
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/jarvis/knowledge/onec-skills.ts"), "utf8");
    assert.equal(source.includes("child_process"), false);
    assert.equal(/\b(execFile|execSync|spawnSync)\b/.test(source), false);
    const rejected = validateAgentPlan({
      objective: "run cf-edit",
      responseMode: "execute",
      message: "no",
      steps: [{ tool: "cf-edit", target: "srv1c01", reason: "skill script" }],
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "PLAN_REJECTED");
  });

  it("retrieves a form-pattern snippet without shell text", () => {
    assert.equal(isOnecSkillQuery("какой ip у роутера"), false);
    const hits = onecSkillHits("Как устроена форма документа в 1С?");
    assert.ok(hits.length > 0);
    assert.ok(hits[0].score >= 0.55);
    assert.match(hits[0].source, /\/skills\/form-/);
    assert.match(hits[0].heading, /Форма документа/);
    assert.match(hits[0].text, /JARVIS_ONEC_SKILL_DOCS_ONLY/);
    assert.doesNotMatch(hits[0].text, /powershell|\.ps1\b|1cv8/i);
    const load = onecSkillHits("Как загрузить конфигурацию из CF?");
    assert.match(load[0].source, /vendor\/cc-1c-skills\/text\//);
    assert.match(load[0].text, new RegExp(ONEC_SKILL_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("answers a 1C how-to from the pack and does not call tools", async () => {
    let prompt = "";
    let planned = false;
    let tools = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      prompt = String(init?.body ?? "");
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ message: { content: JSON.stringify({ answer: "Форма документа: шапка, табличная часть, подвал." }) } }),
      };
    }) as never;
    const result = await runAgentTurn("Как устроена форма документа в 1С?", {
      session: { id: "s", accountId: "admin1", role: "admin", expiresAt: Date.now() + 60_000, channel: "web" },
      stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-onec-")),
      env: {
        JARVIS_AI_AGENT_ENABLED: "1",
        JARVIS_LLM_SENSITIVE_PROVIDER: "ollama",
        JARVIS_LLM_INTENT_PROVIDER: "ollama",
        JARVIS_LLM_LOCAL: "1",
        JARVIS_OLLAMA_URL: "http://ollama.test",
        JARVIS_OLLAMA_MODEL: "m",
        JARVIS_LLM_RETRY_ATTEMPTS: "1",
      } as NodeJS.ProcessEnv,
      fetch: fetchImpl,
      retriever: async () => [],
      planner: (async () => {
        planned = true;
        return { ok: false, code: "LLM_UNAVAILABLE", detail: "planner must not run" };
      }) as never,
      toolRunner: (() => {
        tools += 1;
        throw new Error("tool runner must not run");
      }) as never,
    });
    assert.equal(planned, false);
    assert.equal(tools, 0);
    assert.equal(result.code, "OK");
    assert.match(result.answer, /Форма документа/);
    assert.ok(result.sources?.some((source) => source.startsWith("vendor/cc-1c-skills/")));
    assert.match(prompt, /Форма документа/);
    assert.match(prompt, /JARVIS_ONEC_SKILL_DOCS_ONLY/);
    assert.match(prompt, new RegExp(ONEC_SKILL_PROMPT_RULE.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(prompt, /powershell(?:\.exe)?|\.ps1\b|CLAUDE_SKILL_DIR|writeFileSync/);
  });

  it("stays quiet when the pack is disabled", () => {
    const env = { JARVIS_ONEC_SKILLS: "0" } as NodeJS.ProcessEnv;
    assert.deepEqual(onecSkillHits("Как устроена форма документа в 1С?", { env }), []);
  });
});
