# JARVIS tool execution

JARVIS can call SSH and MikroTik tools through a registry and an Ollama tool-calling loop. Read-only tools run on their own. Change tools stop and show the exact command until an operator or admin presses Approve or Reject.

`EXECUTION_MODE` defaults to `dry-run`. In that mode the loop still plans the command, writes the audit row, and does not open a connection. Set `EXECUTION_MODE=live` only on the host that should talk to your network.

## Secrets

Do not commit hosts, passwords, or private keys.

- Copy `.env.example` to an untracked env file, or set the same variables in the process manager.
- Or point `JARVIS_SECRETS_FILE` at a JSON file outside the repository. `secrets/jarvis.example.json` shows the shape with empty credentials.
- SSH uses key auth. `JARVIS_SSH_<ALIAS>_KEY` must be an absolute path. Password SSH is not implemented.
- The MikroTik password is sent only as HTTP basic auth from the server process. It is not returned to the browser and is stripped from the audit log.
- `data/` and real files under `secrets/` are gitignored.

## Tools

Each tool declares `read-only` or `change`.

| Tool | Risk | What it does |
| --- | --- | --- |
| `ssh_read` | read-only | One allowlisted command on a configured host |
| `ssh_change` | change | One allowlisted `systemctl restart` for nginx, postfix, or dovecot |
| `mikrotik_interfaces` | read-only | `GET /rest/interface` |
| `mikrotik_firewall` | read-only | `GET /rest/ip/firewall/filter` |
| `mikrotik_dhcp_leases` | read-only | `GET /rest/ip/dhcp-server/lease` |
| `mikrotik_logs` | read-only | `GET /rest/log` |
| `mikrotik_resources` | read-only | `GET /rest/system/resource` |
| `mikrotik_export` | change | `POST /rest/system/backup/save` with a server-chosen name |
| `mikrotik_set_interface` | change | `PATCH /rest/interface/<name>` with `disabled` true or false |

The model does not get a free-form shell or an arbitrary RouterOS path. SSH commands must match the allowlist. A denylist (rm, shutdown, reboot, sudo, shell metacharacters, and the rest in code) wins even if an allowlist entry would match. Approval cannot override that denial.

Unknown host aliases are rejected. Live SSH also requires an identity file; live MikroTik requires a password. Missing credentials are an error, not a silent success.

## Ollama

The loop calls `POST {OLLAMA_BASE_URL}/api/chat` with `OLLAMA_MODEL` (default `qwen3`) and the tool schemas. If Ollama is down or returns no tool call, a small phrase matcher handles explicit SSH and MikroTik requests. Other phrases stay on the existing policy console.

Change tools end the loop. The model is not told that the change already ran.

## Approval and roles

Demo actors:

- `admin1` — admin, can approve
- `operator1` — operator, can approve
- `viewer` — can request tools, cannot approve
- `чужой аккаунт` — not on the allowlist, tools are denied

Only `admin` and `operator` can approve. A viewer sees the command with Approve and Reject disabled. Reject, or Approve while dry-run is on, does not connect. A second Approve on the same id does nothing.

Set `JARVIS_OPERATORS` or the `operators` array in the secrets file to replace the demo list. The browser sends the actor id; the server looks up the role. This is not a substitute for network access control in front of the app.

## Audit

Every call is appended to `JARVIS_AUDIT_PATH` (default `data/audit.jsonl`): actor, role, tool, command, mode, time, and result. The admin page is `/admin/audit`. The console journal shows the same rows.

Pending approvals live in the server process. A restart drops an approval that nobody has answered; the audit row remains.
