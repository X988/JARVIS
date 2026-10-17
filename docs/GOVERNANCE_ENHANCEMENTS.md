# Governance Enhancements

Added in branch `feature/governance-enhancements`.

## Verified Autonomy Pipeline
`src/lib/jarvis/server/autonomy-pipeline.ts`

5 stages that every action must pass:
1. Identity
2. Inventory
3. Policy (includes kill switch)
4. Approval
5. Verification readiness

Use `runAutonomyPipeline()` + `pipelineAllows()` before Gateway.

## Execution Rings & Kill Switch
`src/lib/jarvis/server/policy.ts`

- `requiredRing(policy, mutates)` → 0 (read) / 1 (approved) / 2 (elevated) / 3 (admin)
- `isKillSwitchActive()` — set `JARVIS_KILL_SWITCH=1` to halt all mutating execution

## Deny-by-default MCP
`src/lib/jarvis/plane/mcp.ts`

Unpublished tools and runbooks are denied. Discovery ≠ execution authority.

## Runbook Versioning & Dry-run
Existing runbooks already support dry-run via `EXECUTION_MODE=dry-run` (default).
Version field can be added to the `Runbook` type when needed; current registry is the source of truth.

## Audit
Existing SHA-256 hash-chain in `audit-log.ts` remains the tamper-evident local record. External sink (HTTP/Loki) is the production anchor.

## Integration
Call the autonomy pipeline from `processCommand` / `processRegisteredReadOnlyTool` before `safeGateway` for stronger guarantees. Current pipeline already enforces most of these checks; the new module makes the stages explicit and reusable.
