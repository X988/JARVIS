export type Source = { title: string; locator: string };

export function researchReport(question: string, sources: Source[]): { ok: true; question: string; sources: Source[] } | { ok: false; code: "NO_SOURCES" } {
  const clean = sources.filter((item) => item.title && item.locator);
  if (!question.trim() || clean.length === 0) return { ok: false, code: "NO_SOURCES" };
  return { ok: true, question, sources: clean };
}
