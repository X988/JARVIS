/**
 * Server-side gate for screen capture.
 * Capture is untrusted input only. Flag must be explicitly enabled.
 */
export function screenCaptureAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.JARVIS_SCREEN_CAPTURE_ENABLED;
  return v === "1" || v === "true";
}
