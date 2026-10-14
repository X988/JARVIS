import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { sqlDatabase } from "../server/sql.ts";
import { SQLExecutor } from "../server/adapters.ts";
import {
  createTelegramApi,
  dispatchTelegram,
  handleTelegramWebhook,
  sendTelegramArtifact,
  telegramUpdate,
} from "./telegram-bot.ts";
import { decodeTelegramAudio } from "../voice/turn.ts";

const actors = { "100842": { actorId: "admin1" as const, role: "operator" as const } };

function silenceOgg(): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ogg-"));
  const file = path.join(dir, "silence.ogg");
  const run = spawnSync(
    "ffmpeg",
    ["-nostdin", "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "0.4", "-c:a", "libopus", file],
    { timeout: 10_000 },
  );
  assert.equal(run.status, 0);
  return fs.readFileSync(file);
}

describe("telegram transport", () => {
  it("keeps attachment and reply/forward context separate from command text", () => {
    const parsed = telegramUpdate({
      update_id: 5,
      message: {
        from: { id: 100842 },
        chat: { id: 100842 },
        caption: "Проверь документ",
        document: { file_id: "doc-1", file_name: "../report.txt", file_size: 120 },
        reply_to_message: { message_id: 4, text: "старый ответ" },
        forward_origin: { sender_user: { id: 777 } },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.update.text, "Проверь документ");
    assert.equal(parsed?.update.documentFileId, "doc-1");
    assert.match(parsed?.update.replyTo ?? "", /^4:/);
    assert.equal(parsed?.update.forwardedFromId, 777);
  });

  it("stores an authorized document as untrusted reference without executing it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tg-"));
    let actions = 0;
    let messages = 0;
    const result = await dispatchTelegram(
      {
        update_id: 6,
        message: {
          from: { id: 100842 },
          chat: { id: 100842 },
          document: { file_id: "doc", file_name: "../../passwd.txt", file_size: 12 },
        },
      },
      {
        stateDir: root,
        actors,
        api: {
          getFile: async () => "documents/doc.txt",
          download: async () => Buffer.from("untrusted text"),
          sendMessage: async () => {
            messages += 1;
            return true;
          },
          sendChatAction: async () => {
            actions += 1;
            return true;
          },
        },
      },
    );
    assert.equal(result.code, "ATTACHMENT_STORED");
    assert.equal(result.attachmentStored, true);
    assert.equal(actions, 1);
    assert.equal(messages, 1);
    const inbound = path.join(root, "inbound");
    const names = fs.readdirSync(inbound);
    assert.equal(names.length, 1);
    assert.equal(names[0].includes(".."), false);
    assert.equal(fs.readFileSync(path.join(inbound, names[0]), "utf8"), "untrusted text");
  });

  it("cleans expired inbound attachments and removes inbound symlinks without touching their targets", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tg-retention-"));
    const inbound = path.join(root, "inbound");
    fs.mkdirSync(inbound, { recursive: true });
    const old = path.join(inbound, "old.txt");
    fs.writeFileSync(old, "old");
    const oldTime = new Date(Date.now() - 120_000);
    fs.utimesSync(old, oldTime, oldTime);

    const outside = path.join(root, "outside.txt");
    fs.writeFileSync(outside, "keep");
    const link = path.join(inbound, "link.txt");
    fs.symlinkSync(outside, link);

    const result = await dispatchTelegram(
      {
        update_id: 61,
        message: {
          from: { id: 100842 },
          chat: { id: 100842 },
          document: { file_id: "doc-new", file_name: "new.txt", file_size: 3 },
        },
      },
      {
        stateDir: root,
        actors,
        env: {
          JARVIS_TELEGRAM_INBOUND_RETENTION_MS: "60000",
          JARVIS_TELEGRAM_INBOUND_MAX_FILES: "10",
        },
        api: {
          getFile: async () => "documents/new.txt",
          download: async () => Buffer.from("new"),
          sendMessage: async () => true,
        },
      },
    );

    assert.equal(result.code, "ATTACHMENT_STORED");
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(link), false);
    assert.equal(fs.readFileSync(outside, "utf8"), "keep");
    const names = fs.readdirSync(inbound);
    assert.equal(names.length, 1);
    assert.match(names[0] ?? "", /^61-/);
  });

  it("delivers only bounded non-secret outbound artifacts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-out-"));
    fs.writeFileSync(path.join(root, "report.txt"), "safe report");
    fs.writeFileSync(path.join(root, "secret.txt"), "password=hidden");
    let sent = 0;
    const api = {
      getFile: async () => null,
      download: async () => null,
      sendMessage: async () => true,
      sendDocument: async () => {
        sent += 1;
        return true;
      },
    };
    assert.equal((await sendTelegramArtifact(api, 1, { root, relative: "report.txt" })).ok, true);
    assert.equal((await sendTelegramArtifact(api, 1, { root, relative: "secret.txt" })).ok, false);
    assert.equal((await sendTelegramArtifact(api, 1, { root, relative: "../outside.txt" })).ok, false);
    assert.equal(sent, 1);
  });
  it("keeps dangerous Telegram text in deterministic policy even when AI is enabled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tg-ai-"));
    let reply = "";
    const result = await dispatchTelegram(
      {
        update_id: 62,
        message: {
          from: { id: 100842 },
          chat: { id: 100842 },
          text: "Удали базу utp",
        },
      },
      {
        stateDir: root,
        actors,
        env: {
          JARVIS_AI_AGENT_ENABLED: "1",
          EXECUTION_MODE: "dry-run",
        },
        api: {
          getFile: async () => null,
          download: async () => null,
          sendMessage: async (_chatId, text) => {
            reply = text;
            return true;
          },
        },
      },
    );
    assert.equal(result.code, "POLICY_DENIED");
    assert.equal(result.sent, true);
    assert.match(reply, /запрещ|удален|политик|deny/i);
  });

  it("turns an ogg voice note into a 16 kHz wav before recognition", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audio-"));
    const decoded = decodeTelegramAudio(silenceOgg(), { JARVIS_AUDIO_DIR: root });
    assert.equal("wav" in decoded, true);
    if (!("wav" in decoded)) return;
    const wav = fs.readFileSync(decoded.wav);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(24), 16_000);
    assert.equal(wav.readUInt16LE(22), 1);
    for (const file of decoded.cleanup) fs.rmSync(file, { force: true });
  });

  it("does not download a voice note for an unknown telegram id", async () => {
    let downloads = 0;
    const result = await dispatchTelegram(
      { update_id: 7, message: { text: "Проверь сервер", from: { id: 50 }, chat: { id: 50 }, voice: { file_id: "abc" } } },
      {
        stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tg-")),
        actors,
        api: {
          getFile: async () => {
            downloads += 1;
            return "voice/a.ogg";
          },
          download: async () => {
            downloads += 1;
            return Buffer.alloc(0);
          },
          sendMessage: async () => true,
        },
      },
    );
    assert.equal(result.code, "ACTOR_DENIED");
    assert.equal(result.sent, false);
    assert.equal(downloads, 0);
  });

  it("downloads ogg through the bot API and answers in the chat", async () => {
    const ogg = silenceOgg();
    const seen: string[] = [];
    const server = http.createServer((request, response) => {
      seen.push(request.url ?? "");
      if (request.url?.startsWith("/bottest/getFile")) {
        response.end(JSON.stringify({ ok: true, result: { file_path: "voice/note.ogg" } }));
        return;
      }
      if (request.url === "/file/bottest/voice/note.ogg") {
        response.end(ogg);
        return;
      }
      if (request.url?.startsWith("/bottest/sendMessage")) {
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const env = {
      JARVIS_TELEGRAM_TOKEN: "test",
      JARVIS_TELEGRAM_API_BASE: `http://127.0.0.1:${port}`,
      JARVIS_TELEGRAM_WEBHOOK_SECRET: "hook",
      JARVIS_AUDIO_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audio-")),
      JARVIS_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tg-")),
    };
    try {
      const api = createTelegramApi(env);
      assert.equal("getFile" in api, true);
      if (!("getFile" in api)) return;
      const result = await dispatchTelegram(
        { update_id: 8, message: { from: { id: 100842 }, chat: { id: 100842 }, voice: { file_id: "note" } } },
        { stateDir: env.JARVIS_STATE_DIR, actors, api, env },
      );
      assert.equal(result.code, "NO_SPEECH");
      assert.equal(result.sent, true);
      assert.equal(seen.some((url) => url.includes("../")), false);
      const denied = await handleTelegramWebhook(
        new Request("http://localhost/api/telegram", {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": "wrong" },
          body: "{}",
        }),
        env,
      );
      assert.equal(denied.status, 401);
    } finally {
      server.close();
    }
  });
});

describe("sql adapter", () => {
  it("takes the database name from inventory and refuses a free-form name", () => {
    assert.equal(sqlDatabase("utp"), "utp");
    assert.equal(sqlDatabase("no-such"), null);
  });

  it("does not send a query without a password, and a closed port is a failed connection", () => {
    const host = process.env.JARVIS_SQL_HOST;
    const user = process.env.JARVIS_SQL_USER;
    const password = process.env.JARVIS_SQL_PASSWORD;
    const port = process.env.JARVIS_SQL_PORT;
    delete process.env.JARVIS_SQL_HOST;
    delete process.env.JARVIS_SQL_USER;
    delete process.env.JARVIS_SQL_PASSWORD;
    try {
      const missing = new SQLExecutor().execute({ runbook: "sql.health", target: "utp", mode: "real" });
      assert.equal(missing.code, "NOT_CONFIGURED");
      assert.equal(missing.called, false);
      process.env.JARVIS_SQL_HOST = "127.0.0.1";
      process.env.JARVIS_SQL_USER = "jarvis-read";
      process.env.JARVIS_SQL_PORT = "1";
      const noPassword = new SQLExecutor().execute({ runbook: "sql.health", target: "utp", mode: "real" });
      assert.equal(noPassword.code, "CREDENTIAL_UNAVAILABLE");
      process.env.JARVIS_SQL_PASSWORD = "not-a-real-password";
      const failed = new SQLExecutor().execute({ runbook: "sql.health", target: "utp", mode: "real" });
      assert.equal(failed.called, false);
      assert.equal(failed.code, "CONNECT_FAILED");
      assert.doesNotMatch(failed.detail, /SELECT |BACKUP DATABASE/);
    } finally {
      if (host === undefined) delete process.env.JARVIS_SQL_HOST;
      else process.env.JARVIS_SQL_HOST = host;
      if (user === undefined) delete process.env.JARVIS_SQL_USER;
      else process.env.JARVIS_SQL_USER = user;
      if (password === undefined) delete process.env.JARVIS_SQL_PASSWORD;
      else process.env.JARVIS_SQL_PASSWORD = password;
      if (port === undefined) delete process.env.JARVIS_SQL_PORT;
      else process.env.JARVIS_SQL_PORT = port;
    }
  });
});
