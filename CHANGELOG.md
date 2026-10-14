# Changelog

All notable changes are documented here. This project follows Semantic Versioning for release identity, but production verification is tracked separately.

## [Unreleased]

- Hands-free browser voice conversation: microphone VAD, server faster-whisper, hybrid agent/command reply, sentence-sized Piper playback. Voice cannot confirm or execute mutations.
- Live infrastructure verification is still required for WinRM, SSH, SQL restore, RouterOS, Mailcow, Telegram, external audit delivery, STT/TTS and 1С external validators.
- Production deployment remains human-gated and is not performed by workers or the LLM.

## [0.1.0] - 2026-10-07

### Added

- Server-owned infrastructure runbook/policy/approval/execution pipeline.
- Filesystem-backed state abstractions for approvals, idempotency, rate limiting, jobs, audit and execution metadata.
- Fresh live-probe semantics for production readiness.
- Prometheus metrics and JSON operational status.
- Durable HTTP/Loki audit outbox with retry/backlog metrics.
- Safe fixed adapters for Windows/WinRM, Linux/SSH, SQL Server, RouterOS, Mailcow and GitHub CI where implemented.
- Development/test-only 1С file workflow with production and dynamic execution denials.
- Coverage baseline, secret scanning, dependency audit and CycloneDX SBOM CI gates.
- Bounded retention for operational state, Telegram inbound files and clean inactive coding worktrees.

### Security

- Multi-process rate-limit lost-update race fixed.
- Idempotency storage keys hash actor IDs.
- Long-running idempotent operations now use owner/PID-aware crash recovery instead of a short time lease.
- Corrupted security state fails closed.
- GitHub Actions use immutable commit SHAs.
- Workers remain unable to push/merge/deploy production or receive production credentials.

### Status

Version 0.1.0 is **pre-production**. It is implemented and CI-tested, but not production-verified against the target infrastructure.
