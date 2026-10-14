# Office infrastructure

## Network
- Office LAN: 192.168.0.0/24, domain `energo.local`. Gateway: MikroTik **CCR1009** router at 192.168.0.250 (identity `MikroTik-KP`). In JARVIS config the router target id is still `rb5009`; that is a legacy id kept so existing config keeps working. The hardware is a CCR1009, not an RB5009.
- The router's DHCP server hands out DNS servers 192.168.0.173 and 192.168.0.113, which are probably the domain controllers. A second DHCP network, 192.168.55.0/24, runs on a VLAN.
- Router management that JARVIS uses: REST over HTTPS on port 443 (`www-ssl`, certificate `jarvis-rest` signed by `jarvis-ca`), allowed only from 192.168.0.156. The API port 8728 and Winbox on port 54321 are also open on the LAN. SSH (22) and HTTP (80) are closed.
- JARVIS reads the router as user `jarvis-read` (group policy `read,api,rest-api`; no write access). Router change tools are disabled (`JARVIS_MIKROTIK_CHANGE_ENABLED=0`).

## 192.168.0.156 — JARVIS host
- Ubuntu 24.04 with an RTX 3080 (10 GB). User `toor`; sudo is not available.
- JARVIS app: `/home/toor/jarvis`, systemd unit `jarvis.service` (User=toor, `Restart=always`). Vite dev server on 127.0.0.1:8095, served by the `jarvis-caddy` container on port 9443 (HTTPS).
- State: `data/` (PGlite in `data/pglite`, hash-chained audit log in `data/audit.jsonl`, archived broken chain in `data/audit-archive/`).
- Ollama: 127.0.0.1:11434. Chat model `qwen3:8b`, embedding model `nomic-embed-text`.
- Voice: speech-to-text with faster-whisper `large-v3-turbo` on CUDA; text-to-speech with Piper `ru_RU-ruslan-medium` (`/opt/jarvis/venv/bin/piper`, models in `/opt/jarvis/models`).
- Execution mode: `EXECUTION_MODE=real` since 2026-10-14. Read-only tools run; change tools need approval; voice never executes tools.
- Backups before every change: `~/jarvis-backups/<name>-<timestamp>/` (`data-env.tgz` holds `.env` and `data/`; `head.txt` holds the git commit).
- Secrets for integrations live in `~/jarvis-secrets/` (mode 700) and in `.env` (mode 600). Never copy them into git or chat.

## 192.168.0.184 — Prediction-League
- Separate Hyper-V VM that runs the Prediction-League web app (`~/prediction-league`). JARVIS no longer runs there.
- Do not change it as part of JARVIS work unless the user explicitly asks.

## JARVIS inventory targets
- `fleet` = dc01, srv1c01, sql01, fs01 (Windows, WinRM) and mail01 (Linux, SSH, mailcow).
- These hosts are not yet mapped to IPs: none of them shows up by hostname in DHCP. The draft device inventory lists the candidate servers (Hyper-V VMs at .3, .34, .54, .64, .90, .186, .215; physical SRV-1 .92, NAS .97, Dell "server" .152).
