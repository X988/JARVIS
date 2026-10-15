import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBodyBounded } from "./request-body.ts";

test("parses valid JSON when Content-Length is absent", async () => {
  const request = new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "status" }),
  });
  assert.equal(request.headers.has("content-length"), false);
  assert.deepEqual(await readJsonBodyBounded(request), {
    ok: true,
    value: { text: "status" },
  });
});

test("rejects an oversized body even when Content-Length is absent", async () => {
  const request = new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(64 * 1024 + 1),
  });
  assert.equal(request.headers.has("content-length"), false);
  assert.deepEqual(await readJsonBodyBounded(request), { ok: false, status: 413 });
});

test("rejects malformed JSON", async () => {
  const request = new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.deepEqual(await readJsonBodyBounded(request), { ok: false, status: 400 });
});

test("rejects a declared oversized body before reading it", async () => {
  const request = new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(64 * 1024 + 1) },
    body: "{}",
  });
  assert.deepEqual(await readJsonBodyBounded(request), { ok: false, status: 413 });
});
