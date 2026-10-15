# Office infrastructure

## Network (сеть, роутер, шлюз, IP адреса)
Ключевые слова: какой IP у роутера, роутер, микротик, шлюз, DHCP, DNS, подсеть, порты.
- Office LAN: 192.168.0.0/24, domain `energo.local`. Gateway: MikroTik **CCR1009** router at 192.168.0.250 (identity `MikroTik-KP`). In JARVIS config the router target id is still `rb5009`; that is a legacy id kept so existing config keeps working. The hardware is a CCR1009, not an RB5009.
- The router's DHCP server hands out DNS servers 192.168.0.173 and 192.168.0.113, which are probably the domain controllers. A second DHCP network, 192.168.55.0/24, runs on a VLAN.
- Router management that JARVIS uses: REST over HTTPS on port 443 (`www-ssl`, certificate `jarvis-rest` signed by `jarvis-ca`), allowed only from 192.168.0.156. The API port 8728 and Winbox on port 54321 are also open on the LAN. SSH (22) and HTTP (80) are closed.
- JARVIS reads the router as user `jarvis-read` (group policy `read,api,rest-api`; no write access). Router change tools are disabled (`JARVIS_MIKROTIK_CHANGE_ENABLED=0`).

## 192.168.0.156 — JARVIS host (сервер JARVIS)
Ключевые слова: где работает JARVIS, сервер JARVIS, Ollama, модель, голос, Piper, Whisper, бэкапы.
- Ubuntu 24.04 with an RTX 3080 (10 GB). User `toor`; sudo is not available.
- JARVIS app: `/home/toor/jarvis`, systemd unit `jarvis.service` (User=toor, `Restart=always`). Vite dev server on 127.0.0.1:8095, served by the `jarvis-caddy` container on port 9443 (HTTPS).
- State: `data/` (PGlite in `data/pglite`, hash-chained audit log in `data/audit.jsonl`, archived broken chain in `data/audit-archive/`).
- Ollama: 127.0.0.1:11434. Chat model `qwen3:8b`, embedding model `nomic-embed-text`.
- Voice: speech-to-text with faster-whisper `large-v3-turbo` on CUDA; text-to-speech with Piper `ru_RU-ruslan-medium` (`/opt/jarvis/venv/bin/piper`, models in `/opt/jarvis/models`).
- Execution mode: `EXECUTION_MODE=real` since 2026-10-14. Read-only tools run; change tools need approval in the text console (exact CONFIRM phrase). Demo commands (for example the billing rollback) do not exist in real mode.
- Voice (голос): since 2026-10-15 voice may run strictly read-only runbooks (risk 0, no mutation, policy ALLOW: router status, interfaces, routes, DHCP, firewall counters, log, WireGuard, resources). The server enforces this, not the client. Any change by voice is refused ("Голос не выполняет изменения") and must be done by text with CONFIRM. Voice turns are audited with `channel=voice`. Kill switch: `JARVIS_VOICE_READ_EXECUTE=0` turns voice back into talk-only.
- Backups before every change: `~/jarvis-backups/<name>-<timestamp>/` (`data-env.tgz` holds `.env` and `data/`; `head.txt` holds the git commit).
- Secrets for integrations live in `~/jarvis-secrets/` (mode 700) and in `.env` (mode 600). Never copy them into git or chat.

## MikroMCP (где работает MikroMCP, порт MikroMCP)
Ключевые слова: где работает MikroMCP, на каком порту MikroMCP, MCP сервер роутера.
- MikroMCP v1.13.2 runs on 192.168.0.156 in the Docker container `mikromcp` (`~/mikromcp`, managed by the other assistant; JARVIS does not change it). It listens only on **127.0.0.1:8787**, path `/mcp` (not reachable from the LAN). Identity `jarvis-ro` (read-only), router id `mikrotik-kp`.
- JARVIS uses only 7 allowlisted read tools (get_system_status, list_interfaces, list_routes, list_dhcp_leases, list_firewall_rules, get_log, list_wireguard_peers); write or run_command tools are refused. If MikroMCP fails, JARVIS falls back to its own read-only REST client.
- Timeouts: MikroMCP 20 s (`JARVIS_MIKROMCP_TIMEOUT_MS`), router REST 15 s (`JARVIS_ROUTEROS_TIMEOUT_MS`), each router read runbook 45 s total. Every router call, including failures and timeouts, is written to the audit log (`mikromcp.call:<tool>` / `routeros.call:<mode>`).

## Audit and roles (аудит, журнал, роли)
Ключевые слова: где журнал аудита, кто видит аудит, роли.
- Audit log: hash-chained `data/audit.jsonl`; `/ready` reports chain verification. The audit page `/admin/audit` and `/api/audit` are for the **admin** role only; operator and viewer get 403 with the reason, anonymous 401. Roles come from `JARVIS_WEB_ACTORS_JSON` in `.env` (the owner's binding is admin).

## MikroDash (дашборд роутера)
- MikroDash is served by Caddy on port **9445** (HTTPS) on 192.168.0.156. Its live data needs the router's api-ssl (8729), which is still disabled on the router, so the dashboard is not fully working yet.

## 192.168.0.184 — Prediction-League (сайт прогнозов)
- Separate Hyper-V VM that runs the Prediction-League web app (`~/prediction-league`). JARVIS no longer runs there.
- Do not change it as part of JARVIS work unless the user explicitly asks.

## JARVIS inventory targets (серверы, инвентарь)
Ключевые слова: какие серверы, dc01, srv1c01, sql01, fs01, mail01, флот серверов.
- `fleet` = dc01, srv1c01, sql01, fs01 (Windows, WinRM) and mail01 (Linux, SSH, mailcow).
- These hosts are not yet mapped to IPs: none of them shows up by hostname in DHCP. The draft device inventory lists the candidate servers (Hyper-V VMs at .3, .34, .54, .64, .90, .186, .215; physical SRV-1 .92, NAS .97, Dell "server" .152).
