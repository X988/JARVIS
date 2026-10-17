# JARVIS Worker

Background process for scheduled tasks (runDue, audit flush, worktree cleanup, monitoring probes).

## Start
```bash
npm run worker
```
or via systemd:
```bash
sudo systemctl enable --now jarvis-worker
```

## Variables
- `JARVIS_WORKER_INTERVAL_MS` (default 60000, min 5000, max 3600000)
- `JARVIS_STATE_DIR`
- `JARVIS_HEARTBEAT_URL` (optional external heartbeat)

## Diagnostics
Logs to stdout. Heartbeat age visible in `/ready` and `/metrics`.
Single instance enforced by state lock; second instance exits with message.
