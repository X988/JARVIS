import type { AuditRecord } from "./types.ts";

export function redactText(input: string): string {
  return input
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-key]")
    .replace(/\b(password|passwd|secret|token|authorization|api[_-]?key)\b(\s*[:=]\s*)(\S+)/gi, "$1$2[redacted]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, "Basic [redacted]");
}

export function redactRecord(record: AuditRecord): AuditRecord {
  return {
    ...record,
    command: redactText(record.command).slice(0, 500),
    detail: redactText(record.detail).slice(0, 4000),
  };
}
