# Runbook: deploy and rollback JARVIS on .156

Deploy:
1. Back up: `B=~/jarvis-backups/pre-<name>-$(date +%Y%m%d-%H%M%S); mkdir -p $B; tar -czf $B/data-env.tgz --exclude=data/pglite .env data; git rev-parse HEAD > $B/head.txt`.
2. `cd ~/jarvis && git fetch origin <branch> && git checkout -B <branch> FETCH_HEAD`. Run `npm ci` only if `package-lock.json` changed.
3. Restart without sudo: `kill $(systemctl show -p MainPID --value jarvis)`. systemd restarts it (`Restart=always`).
4. Verify: `systemctl is-active jarvis`, `curl -s http://127.0.0.1:8095/ready` (auditChain must be OK), then a real request.

Rollback:
1. `git checkout <commit from $B/head.txt>` (or `main`).
2. If config or data changed: `tar -xzf $B/data-env.tgz -C ~/jarvis` (this restores `.env` and `data/`; PGlite is not included).
3. Restart as above and verify `/ready`.
4. To stop real execution quickly, set `EXECUTION_MODE=dry-run` in `.env` and restart.
