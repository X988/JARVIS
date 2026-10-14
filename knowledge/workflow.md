# Operator workflow rules

Ключевые слова: правила работы, порядок изменений, pull request, тесты, бэкап, деплой, мерж, секреты, force push.

These rules apply to every change to JARVIS or to servers:

1. Code changes go to a new branch and a pull request. Never push directly to `main`. Never force-push.
2. Run the tests (`npm test`) before deploying. Report the pass and fail counts.
3. Back up the server before deploying (`~/jarvis-backups/<name>-<timestamp>/` with `.env`, `data/` and the current commit).
4. Deploy the branch, restart the service, then verify (`/ready`, a real request).
5. Ask the user before merging a PR. Never merge on your own.
6. Never commit or print secrets (passwords, tokens, keys, `.env` values). Secrets stay in `.env` (600) or `~/jarvis-secrets/` (700).
7. If a deploy fails, roll back to the backup and report.
8. Approval is required for externally visible or irreversible actions (sending messages, deleting, router or server changes).
9. Do not guess passwords. If a login fails, stop and ask.
