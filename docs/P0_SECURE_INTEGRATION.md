# P0 secure integration

This branch is `jarvis/p0-secure-integration`. It is an integration and security pass. It is not a production rollout and it was not merged into `main`.

## What was already on the source branches

| Pull request | Branch | Head | Used as |
| --- | --- | --- | --- |
| #1 | `jarvis/prod-contour` | `fe7b7ce` | Server contour: inventory, runbooks, policy, approval file, hash-chain audit, gateway. CI on that PR was green. |
| #2 | `cursor/lan-email-password-13f1` | `ff0f83b` | Local email sign-in and `JARVIS_WEB_ACTORS_JSON`. One commit on top of #1. |
| #3 | `cursor/voice-call-mode-aae8` | `750373a` | Voice as an input channel. One commit on top of #2. Voice still cannot confirm or execute. |
| #4 | `cursor/jarvis-tool-execution-e76c` | `3718d0c` | Selective port only. The second in-memory tool engine was not copied. |

PR #2 and #3 GitHub Actions jobs failed in about three seconds and the logs are no longer available (`log not found`). The failure is reproduced locally by running the same scripts; it was not inferred from missing logs. PR #4 had no checks.

## Authority

The actor id comes from the verified session (`authenticateRequest`) or the Telegram webhook secret plus `JARVIS_TELEGRAM_ACTORS_JSON`. Roles are `admin`, `operator`, `viewer`, and `none`.

`operatorId`, `actorId`, `role`, `risk`, `approved`, and `policy` in a JSON body are stored as forged fields and are not read by the pipeline. `JARVIS_TEST_AUTH` is ignored when `NODE_ENV=production`. There is no demo-actor fallback.

A viewer may run a non-mutating command. A viewer cannot approve, reject, or call a mutating runbook. Voice and the AI planner stay on the same gateway. The planner cannot mark a tool read-only or lower its risk.

## One gateway

```text
User request
  → authenticated session
  → intent / planner (advisory)
  → Runbook Registry
  → Inventory
  → Policy Engine
  → Approval Engine
  → Execution Gateway
  → adapter
  → verification
  → hash-chain audit
```

`admitModelTool` only maps a model tool name onto a registered runbook. SSH text from the model is not executed. `ssh_change` and any command outside the fixed read-only set are denied. MikroTik backup and interface changes are registered as double-approval runbooks and are not on the default inventory allow-list. The RouterOS client refuses a mutating HTTP call in this block even if `JARVIS_MIKROTIK_CHANGE_ENABLED=1`.

`dry-run` returns before the adapter. An executor exception becomes `EXECUTION_FAILED` and is not stored as success.

## Approvals

Records live in `approvals.json` under the state directory, updated under `state.lock`. Status values include `pending`, `executing`, `confirmed`, `failed`, `rejected`, `expired`, and `mismatch`. Two confirmations of the same id serialize on the lock; the second sees `executing` or `confirmed` and does not call the gateway. A crash after `executing` stays fail-closed until a new request is created. `DENY_ALWAYS` is not cleared by a confirmation. Each record can store audit-chain ids.

## SSH and RouterOS

SSH uses `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, key authentication, and a single connection attempt. `EXECUTION_MODE=real`, production, or `JARVIS_PROFILE=production-infra` refuses to connect without `JARVIS_SSH_KNOWN_HOSTS_FILE` and `JARVIS_SSH_KEY_FILE`.

RouterOS REST paths are a fixed allow-list. `JARVIS_MIKROTIK_TLS_INSECURE=1` and `NODE_TLS_REJECT_UNAUTHORIZED=0` are denied before any socket is opened. Log reads keep a count only, so message text is not copied into the result string.

## Audit

Web, Telegram, voice, and the agent path set `channel` on the hash chain. Version 1 rows (no channel) still verify. New rows use version 2 and include channel, tool, and error. Secret-shaped strings are redacted before the hash is computed. `verifyAudit` detects a changed line.

## Local checks

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run coverage
npm run security:secrets
npm run security:audit
npm run build
npm run db:migrate
npm run e2e
```

`npm run build` does not migrate. `npm run db:migrate` is a no-op without `DATABASE_URL`.

```bash
npm ci
npm run build
npm run db:migrate
EXECUTION_MODE=dry-run npm run start:linux
```

Do not point `EXECUTION_MODE=real` at production hosts from this branch. No live MikroTik or server change was performed here.

## Continuation

GitHub Actions job `check` on this branch (run `38603558350`) finished in about three seconds with an empty step list. The check-run annotation is: recent account payments have failed or the spending limit needs to be increased. The tests themselves did not start. That is the same shape as the missing logs on PR #2 and #3. Re-running the workflow cannot pass until billing is restored. Local checks remain the evidence for this branch.

A broken audit file now stops the command API and the registered read-only tool path before any executor call. The gateway does not append a new hash-chain row onto the damaged file. It writes `audit-integrity-alert.json` beside the state directory. `appendAudit` throws `audit integrity` if another caller tries to extend the chain. Component status reports `auditChain`, `sshLab`, and `routerosLab` from local files and environment only. Those fields do not open SSH or RouterOS sockets.

## Still open

- GitHub Actions logs for the old PR #2 and #3 failures are gone, so the three-second job failure was not attributed to a specific step.
- Live SSH, WinRM, SQL, RouterOS, Mailcow, and 1C were not connected.
- Mutating RouterOS POST/PATCH is intentionally not wired.
- Approval state is a locked JSON file on one disk. It survives a process restart on that disk. It is not a multi-host database.
- External audit delivery is still an outbox. A replaced audit file is not anchored until a sink is configured.
- The Grok preview injector and `vercel.json` remain because removing them would break the preview contract. They are not required for `npm run start:linux`.

Блок 2 собирается поверх этого контура в `jarvis/p1-agent-intelligence` и не подменяет Execution Gateway. Пока PR #5 не влит и обязательные проверки GitHub не зелёные, новые диагностики остаются на тестовых адаптерах.

## Next block

1. Exercise read-only SSH and RouterOS against a lab copy, with a pinned known_hosts file and a read-only RouterOS user.
2. Decide whether MikroTik backup and interface changes should be added to inventory, then implement the POST/PATCH behind the existing approval gate.
3. Move approval records to Postgres if more than one host will run the gateway.
4. Attach the audit outbox to a real sink and alert on `verifyAudit` failure.
5. Re-run this branch's GitHub Actions and keep the log if the job fails at startup.
