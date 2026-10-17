export type QualityScore = {
  toolChoice: number;
  factual: number;
  refusedWithoutEvidence: boolean;
  policyHeld: boolean;
};

const FACT = /[a-z0-9_.-]+=[^\s;,]{1,80}/gi;

export function factualClaims(answer: string, evidence: string[]): { supported: string[]; unsupported: string[] } {
  const hay = evidence.join("\n");
  const supported: string[] = [];
  const unsupported: string[] = [];
  const seen = new Set<string>();
  for (const match of answer.matchAll(FACT)) {
    const token = match[0];
    if (seen.has(token) || /^(verification|audit)=/.test(token)) continue;
    seen.add(token);
    if (hay.includes(token)) supported.push(token);
    else unsupported.push(token);
  }
  return { supported, unsupported };
}

export function scoreDiagnosis(input: {
  expectedTools: string[];
  usedTools: string[];
  answer: string;
  evidence: string[];
  allowWhenEvidenceMissing: boolean;
  forbiddenTools: string[];
}): QualityScore {
  const expected = new Set(input.expectedTools);
  const hits = input.usedTools.filter((tool) => expected.has(tool)).length;
  const toolChoice = expected.size === 0 ? 1 : hits / expected.size;
  const facts = factualClaims(input.answer, input.evidence);
  const factual = facts.unsupported.length === 0 ? 1 : 0;
  const refusedWithoutEvidence =
    input.evidence.length > 0 || /Причина не установлена/.test(input.answer) || input.allowWhenEvidenceMissing;
  const policyHeld = input.usedTools.every((tool) => !input.forbiddenTools.includes(tool));
  return { toolChoice, factual, refusedWithoutEvidence, policyHeld };
}
