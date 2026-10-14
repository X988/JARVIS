# Read-only analyst team: rollout and acceptance

## Intent

Keep the existing corporate JARVIS architecture, authentication, inventory,
Policy Engine, Runbook Registry, approvals, read-only Gateway, verification,
and append-only audit unchanged. This phase introduces **analysis only** and
does not increase execution authority.

This is a stacked change. Merge and verify the P0 gateway hardening from
PR #7 first, then evaluate this branch. Do not merge directly to production
without the release checklist and live verification.

## Roles

1. Coordinator — frame the question and enumerate missing evidence, without
   changing the tool plan or assigning permissions.
2. Context manager — select relevant observations and record contradictions;
   it does not access persistent memory in this phase.
3. Root-cause analyst — assess competing explanations, never infer causality
   from isolated observations.
4. Reviewer — independently inspect the original observations and other
   agents' notes, then issue SUPPORTED or INSUFFICIENT.

The existing bounded LLM planner still chooses registered tools first. The
existing Gateway executes read-only probes before any team call. No agent
has tools, a shell, network access, or an approval authority.

## Activation and behavior

- Default: off. Set JARVIS_ANALYST_TEAM_ENABLED=1 together with the existing
  JARVIS_AI_AGENT_ENABLED=1 only in a controlled test environment.
- Configure valid LLM routing for jobs intent, research, and critic. Roles use
  one intent model call, two research calls in parallel, and one critic call.
- Requires 1–8 observations with code OK, executionCalled=true and auditId.
  MOCK, DRY_RUN, errors, and approval-dependent mutations do not enter team.
- Only sanitized, bounded observations are sent to each model.
- Every declared evidence ID is checked against IDs minted by the server.
- If any model is absent, errors, invents an evidence ID, or the reviewer
  returns INSUFFICIENT, the team does not publish an AI conclusion; the
  server produces an observation-only fallback.
- The team neither reads nor writes persistent memory, databases, Git,
  infrastructure, or the audit log; current behavior remains responsible for
  the durable operation records.

Important limitation: a reviewer and evidence-ID validation **do not prove**
that a free-text answer is true. Continue human review of diagnostic claims.
The four model calls introduce latency/cost; use for complex investigations
rather than simple status checks.

## Tests

Run on the supported Node.js 22 with dependencies installed:

    npm ci
    npm run typecheck
    npm run lint
    npm test
    npm run coverage
    npm run security:secrets
    npm run security:audit
    npm run build
    npm run e2e

The new analyst-team.test.ts covers:
- exactly four roles and deterministic role ordering;
- model input limited to verified observations;
- denied admission for MOCK, DRY_RUN, unaudited or mutation results;
- invalid/fabricated evidence-ID rejection;
- independent reviewer rejection and invalid verdict;
- model-visible credential redaction.

Before enabling outside test, additionally validate actual /api/agent with
a real least-privileged read-only target, authorization, verified audit chain,
provider failure, provider timeout, prompt-injection attempt, and response
latency/cost. A passing unit test is not production verification.

## Later specialty extensions (not implemented in this phase)

Add Windows/AD, Network/RouterOS, SRE/incident and Backup/Recovery as
**analytical profiles**, not new executors. Add only after tests demonstrate
that a specialist improves diagnosis over the four-role baseline. Each
profile requires an explicit evaluation dataset, owner, permission contract,
input/output schema, supported target list and independent reviewer gate.
All real operations must continue through registered runbooks and the
same server authority.

## Source inspirations

Mechanisms were studied from the public wshobson/agents, mrgoonie/claudekit-skills,
and VoltAgent/awesome-claude-code-subagents catalogs. This implementation
is project-specific; no third-party prompt or agent source is copied.
