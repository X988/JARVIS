# JARVIS v0.2.0 Release Notes

**Date:** 2026-10-17  
**Status:** Pre-production

## What's Changed

### Added
- Node.js 24 requirement (engines and CI). Node 22 is no longer supported.
- Informative HUD (phase, effective mode, approval TTL, transcript, confidence) and untrusted screen capture (`getDisplayMedia`) treated as an untrusted input channel.
- LLM circuit breaker (closed/open/half-open) with metrics.
- Worker lock file and heartbeat for safer background execution.
- Documentation-only 1C skill pack (cc-1c-skills, MIT, pinned commit) as RAG context. Scripts, PowerShell, Python, hooks and web-test runners are not installed and are not tools.
- Read-only analyst team (coordinator, context-manager, root-cause-analyst, reviewer). Off by default; enabled only with `JARVIS_ANALYST_TEAM_ENABLED=1` after verified read-only observations with audit IDs. Failure falls back to observation-only `AGENT_PARTIAL`.
- Vite build optimization: manualChunks, es2022 target, cssCodeSplit.
- CI dependency and Vite/Playwright caching; GitHub Actions pinned to immutable SHAs.

### Changed
- SSH executor now uses `StrictHostKeyChecking=yes` (known_hosts must be pre-seeded). `accept-new` is no longer used.
- MikroTik TLS verification remains strict by default; the insecure-config pattern was removed from the client source.
- Agent runtime merges 1C skill hits into knowledge answers and injects the docs-only prompt rule.

### Security
- All workflow `uses:` references are pinned to full commit SHAs.
- Policy scan no longer reports mutable-action-ref, ssh-hostkey-accept-new or tls-insecure-config on the current tree.
- Voice, Telegram, plugins and MCP remain untrusted channels; execution authority stays in the server pipeline.

## Status
Version 0.2.0 is still **pre-production**. CI (typecheck, lint, unit tests, security policy, build) is expected to be green on Node 24, but live verification of WinRM, SSH, SQL, RouterOS, Mailcow, Telegram, external audit delivery, STT/TTS and 1C validators on the target infrastructure is still required before production use.

## How to install
```bash
git clone https://github.com/X988/JARVIS.git
cd JARVIS
npm ci
cp .env.example .env
npm run dev
```

Requires Node.js >= 24.
