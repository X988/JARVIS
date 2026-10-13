import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWebUsers } from "./jarvis-list-web-users.mjs";

test("formatWebUsers prints ids and a pasteable operator map", () => {
  const text = formatWebUsers([
    { id: "uid-1", email: "a@lan.local", name: "Ada" },
    { id: "uid-2", email: "b@lan.local", name: "Bea" },
  ]);
  assert.match(text, /uid-1\ta@lan\.local\tAda/);
  assert.match(text, /"uid-2":\{"actorId":"admin1","role":"operator"\}/);
  assert.doesNotMatch(text, /password/i);
});

test("formatWebUsers explains an empty database", () => {
  assert.match(formatWebUsers([]), /Пользователей нет/);
});
