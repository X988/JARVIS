import fs from "node:fs";
import { auditFile, verifyAudit, type AuditRow } from "../audit-log.ts";
import { sessionUsable, type Session } from "../server/session.ts";
import { withStateLock } from "../server/state-lock.ts";

export type GatewayAuditRecord = {
  id: string;
  at: string;
  actorName: string;
  tool: string;
  command: string;
  host: string;
  risk: string;
  role: string;
  mode: string;
  approvalId: string | null;
  result: string;
  detail: string;
};

/** Read the authoritative chain; never create or append a second audit format. */
export function readGatewayAudit(session: Session | null, stateDir: string): {
  forbidden: boolean;
  records: GatewayAuditRecord[];
} {
  if (!sessionUsable(session) || session.role !== "admin") return { forbidden: true, records: [] };
  return withStateLock(stateDir, () => {
    const file = auditFile(stateDir);
    if (!fs.existsSync(file)) return { forbidden: false, records: [] };
    // This admin view must not allocate an unbounded file. Rotation/archival is
    // an operational prerequisite above this bound; do not silently hide rows.
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error("AUDIT_VIEW_TOO_LARGE");
    if (!verifyAudit(stateDir).ok) throw new Error("AUDIT_INTEGRITY");
    const records = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).slice(-200).reverse()
      .map((line): GatewayAuditRecord => {
        const row = JSON.parse(line) as AuditRow;
        return {
          id: row.hash ?? row.executionId,
          at: row.at,
          actorName: row.actor,
          tool: row.runbook ?? row.tool ?? "—",
          command: row.action,
          host: row.target ?? "—",
          risk: String(row.risk ?? "—"),
          // Older chain rows do not record a role or mode. Never invent them.
          role: "—",
          mode: "gateway",
          approvalId: row.approvalId ?? null,
          result: row.result ?? row.verdict,
          detail: row.error ?? row.verification ?? "",
        };
      });
    return { forbidden: false, records };
  });
}
