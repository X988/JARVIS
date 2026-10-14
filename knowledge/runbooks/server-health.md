# Runbook: server health check

Goal: check whether a server is healthy without changing it.

1. In JARVIS, ask "проверь состояние <host>" or run the tool `server.health` with target `<host>` (or `fleet` for all servers).
2. The tool reads only: uptime, memory, disks and failed services (Linux over SSH; Windows over WinRM/PowerShell).
3. Interpret the result:
   - `OK`: the host answered; check disk usage above 85% and any failed services.
   - `CONNECT_FAILED` / `EXECUTION_TIMEOUT`: the host is unreachable. Check ping, the switch port and the Hyper-V host.
   - `NOT_CONFIGURED`: the host address or credentials are missing in the JARVIS config (`JARVIS_SSH_TARGETS_JSON` / `JARVIS_WINDOWS_TARGETS_JSON`).
4. For the JARVIS host itself (.156): `systemctl status jarvis ollama`, `nvidia-smi`, `df -h /`, and `curl -s http://127.0.0.1:8095/ready`.
5. Do not restart services or clean disks without explicit approval.
