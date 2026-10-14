# Runbook: audit log check

JARVIS writes every command, tool call and knowledge append to a hash-chained log, `data/audit.jsonl`. Each row's `previousHash` links back to `GENESIS`.

1. `curl -s http://127.0.0.1:8095/ready` should show `auditChain` with state `OK` and the row count.
2. If the chain is broken, JARVIS refuses new writes ("audit integrity") and writes `data/audit-integrity-alert.json`.
3. Investigate read-only first: find the first bad row (its hash does not match, or its `previousHash` does not match the row before).
4. Never edit rows in place. To recover: archive the broken file read-only in `data/audit-archive/` (mode 444, record its sha256 in a README), then start a new empty chain. Do this only after the user approves.
5. On 2026-10-14 the chain was archived as `audit-2026-10-14-broken.jsonl` (26 rows; row 26 was unchained, written by an older tool layer) and a new chain was started.
