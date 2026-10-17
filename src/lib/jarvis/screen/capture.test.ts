import { test } from "node:test";
import assert from "node:assert/strict";
import { screenCaptureEnabled } from "./capture.ts";

test("screen capture disabled by default", () => {
  assert.equal(screenCaptureEnabled({}), false);
  assert.equal(screenCaptureEnabled({ JARVIS_SCREEN_CAPTURE_ENABLED: "0" }), false);
});

test("screen capture enabled only with explicit flag", () => {
  assert.equal(screenCaptureEnabled({ JARVIS_SCREEN_CAPTURE_ENABLED: "1" }), true);
  assert.equal(screenCaptureEnabled({ JARVIS_SCREEN_CAPTURE_ENABLED: "true" }), true);
});
