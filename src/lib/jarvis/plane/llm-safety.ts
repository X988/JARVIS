export type LlmSanitizedText = {
  text: string;
  redacted: boolean;
  matches: number;
};

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [^-\r\n]{1,80}PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]{1,80}PRIVATE KEY-----/gi,
  /\b(authorization\s*:\s*bearer)\s+[A-Za-z0-9._~+/-]{8,}/gi,
  /\b(password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["']?[^\s"',;]{4,}["']?/gi,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|github_pat|glpat)-?[A-Za-z0-9_-]{12,}\b/gi,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
];

function replacement(match: string): string {
  const key = /^\s*([A-Za-z][A-Za-z0-9_-]{1,40})\s*[:=]/.exec(match)?.[1];
  return key ? key + "=[REDACTED]" : "[REDACTED_SECRET]";
}

export function sanitizeLlmText(value: string): LlmSanitizedText {
  let text = value;
  let matches = 0;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, (hit) => {
      matches += 1;
      return replacement(hit);
    });
  }
  return { text, redacted: matches > 0, matches };
}

export function containsLlmSecret(value: string): boolean {
  return sanitizeLlmText(value).redacted;
}
