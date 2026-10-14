import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { verifyAudit } from "../audit-log.ts";
import { runAgentTurn } from "../plane/agent-runtime.ts";
import {
  buildIndex,
  chunkMarkdown,
  confirmKnowledge,
  cosine,
  loadChunks,
  looksSecret,
  parseKnowledgeCommand,
  proposeKnowledge,
  retrieve,
  type EmbedFn,
} from "./rag.ts";

// Deterministic bag-of-words embedder for tests (no Ollama needed).
const VOCAB = ["jarvis", "156", "router", "mikrotik", "250", "rollback", "backup", "audit", "chain", "deploy", "site", "down"];
const fakeEmbed: EmbedFn = async (texts) =>
  texts.map((text) => VOCAB.map((word) => (text.toLowerCase().split(/[^a-zа-я0-9]+/).filter((w) => w === word).length)));

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-kb-"));
}

describe("knowledge chunking", () => {
  it("splits by headings and drops secret-like chunks", () => {
    const chunks = chunkMarkdown("knowledge/a.md", "# Net\nrouter mikrotik 250\n## Creds\npassword: hunter2hunter\n## Deploy\nbackup then deploy");
    assert.deepEqual(chunks.map((c) => c.heading), ["Net", "Deploy"]);
    assert.equal(chunks[0].source, "knowledge/a.md");
  });

  it("repo knowledge files contain no secrets", () => {
    const chunks = loadChunks([path.join(process.cwd(), "knowledge")]);
    assert.ok(chunks.length >= 8, "knowledge base is indexed");
    const raw = fs.readdirSync(path.join(process.cwd(), "knowledge"), { recursive: true }) as string[];
    for (const rel of raw.filter((f) => String(f).endsWith(".md"))) {
      assert.equal(looksSecret(fs.readFileSync(path.join(process.cwd(), "knowledge", rel), "utf8")), false, rel);
    }
  });
});

describe("retrieval", () => {
  it("ranks the matching chunk first and caches vectors", async () => {
    const dir = tmp();
    const chunks = [
      ...chunkMarkdown("knowledge/infra.md", "# Router\nmikrotik router 250"),
      ...chunkMarkdown("knowledge/runbooks/deploy-rollback.md", "# Rollback\nrollback deploy backup"),
    ];
    let calls = 0;
    const counting: EmbedFn = async (t) => { calls += t.length; return fakeEmbed(t); };
    const cache = path.join(dir, "cache.json");
    const index = await buildIndex(chunks, counting, { cacheFile: cache });
    await buildIndex(chunks, counting, { cacheFile: cache });
    assert.equal(calls, 2, "second build reuses cache");
    const hits = await retrieve("как сделать rollback после deploy", index, fakeEmbed, { k: 1, minScore: 0.1 });
    assert.equal(hits[0].source, "knowledge/runbooks/deploy-rollback.md");
    assert.ok(cosine([1, 0], [1, 0]) > 0.99);
  });
});

describe("knowledge append", () => {
  it("parses commands", () => {
    assert.deepEqual(parseKnowledgeCommand("запомни: принтер в бухгалтерии .45"), { kind: "propose", text: "принтер в бухгалтерии .45" });
    assert.deepEqual(parseKnowledgeCommand("подтверди знание a1b2c3"), { kind: "confirm", id: "a1b2c3" });
    assert.equal(parseKnowledgeCommand("сколько будет 2+2"), null);
  });

  it("requires confirmation by the same actor and writes an audit row", () => {
    const dir = tmp();
    const proposed = proposeKnowledge("NAS Synology находится на 192.168.0.97", "admin1", dir);
    assert.equal(proposed.code, "APPROVAL_REQUIRED");
    assert.equal(fs.existsSync(path.join(dir, "knowledge", "learned.md")), false, "nothing written before confirmation");
    const id = /знание ([a-f0-9]{6})/.exec(proposed.answer)![1];
    assert.equal(confirmKnowledge(id, "intruder", dir).code, "APPROVAL_MISMATCH");
    const ok = confirmKnowledge(id, "admin1", dir);
    assert.equal(ok.code, "OK");
    assert.match(fs.readFileSync(path.join(dir, "knowledge", "learned.md"), "utf8"), /192\.168\.0\.97/);
    const audit = fs.readFileSync(path.join(dir, "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(audit.at(-1).action, "knowledge.append");
    assert.equal(verifyAudit(dir).ok, true);
    assert.equal(confirmKnowledge(id, "admin1", dir).code, "APPROVAL_EXPIRED", "single use");
  });

  it("refuses secrets and expired confirmations", () => {
    const dir = tmp();
    assert.equal(proposeKnowledge("пароль роутера: Sup3rS3cret!", "admin1", dir).code, "POLICY_DENIED");
    const p = proposeKnowledge("заметка", "admin1", dir, Date.now() - 11 * 60_000);
    const id = /знание ([a-f0-9]{6})/.exec(p.answer)![1];
    assert.equal(confirmKnowledge(id, "admin1", dir).code, "APPROVAL_EXPIRED");
  });
});

describe("agent uses knowledge", () => {
  const session = { id: "s", accountId: "admin1", role: "admin" as const, expiresAt: Date.now() + 60_000, channel: "web" as const };
  const env = { JARVIS_AI_AGENT_ENABLED: "1", JARVIS_LLM_SENSITIVE_PROVIDER: "ollama", JARVIS_LLM_INTENT_PROVIDER: "ollama", JARVIS_LLM_LOCAL: "1", JARVIS_OLLAMA_URL: "http://ollama.test", JARVIS_OLLAMA_MODEL: "m", JARVIS_LLM_RETRY_ATTEMPTS: "1" } as NodeJS.ProcessEnv;
  const planner = (async () => ({ ok: true, plan: { responseMode: "answer", message: "draft", objective: "", steps: [] }, provider: "ollama", model: "m" })) as never;

  it("grounds the answer and cites the source", async () => {
    let prompt = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      prompt = String(init?.body ?? "");
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ message: { content: JSON.stringify({ answer: "Роутер — 192.168.0.250." }) } }) };
    }) as never;
    const result = await runAgentTurn("какой ip у роутера", {
      session, stateDir: tmp(), env, planner, fetch: fetchImpl,
      retriever: async () => [{ id: "x", source: "knowledge/infrastructure.md", heading: "Network", text: "Gateway MikroTik 192.168.0.250", score: 0.8 }],
    });
    assert.equal(result.code, "OK");
    assert.match(result.answer, /192\.168\.0\.250/);
    assert.match(result.answer, /Источник: knowledge\/infrastructure\.md/);
    assert.deepEqual(result.sources, ["knowledge/infrastructure.md"]);
    assert.match(prompt, /Gateway MikroTik/);
  });

  it("knowledge append through the agent needs confirmation", async () => {
    const dir = tmp();
    const first = await runAgentTurn("запомни: камера на складе 192.168.0.77", { session, stateDir: dir, env, planner, retriever: async () => [] });
    assert.equal(first.code, "APPROVAL_REQUIRED");
    const id = /знание ([a-f0-9]{6})/.exec(first.answer)![1];
    const second = await runAgentTurn(`подтверди знание ${id}`, { session, stateDir: dir, env, planner, retriever: async () => [] });
    assert.equal(second.code, "OK");
  });
});
