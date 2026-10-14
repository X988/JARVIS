import type { Decision } from "../model.ts";

export type VoiceTrace = {
  original: string;
  normalized: string;
  steps: string[];
  constraint: string;
  target: string;
  runbook: string;
  risk: number;
  policy: string;
  mode: string;
  execution: string;
  verification: string;
  audit: string;
};

export type VoiceApproval = {
  id: string;
  phrase: string;
  expiresAt: number;
  stage: 1 | 2;
};

export type VoiceCommand = {
  code: string;
  verdict: "allow" | "deny" | "clarify";
  mode: string;
  executionCalled: boolean;
  auditId: string;
  requestId: string;
  trace: VoiceTrace;
  decision: Decision;
  approval: VoiceApproval | null;
};

export type VoiceHearResponse = {
  code: string;
  text: string | null;
  raw: string | null;
  confidence: number | null;
  message: string | null;
};

export type VoiceTurnResponse = {
  code: string;
  spoken: string;
  sentences: string[];
  kind: "command" | "agent";
  executionCalled: boolean;
  mode: string;
  tts: boolean;
  command: VoiceCommand | null;
  answer: string | null;
};
