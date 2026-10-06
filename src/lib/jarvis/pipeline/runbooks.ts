import type { RunbookDefinition } from "./types.ts";

const RUNBOOKS: RunbookDefinition[] = [
  { id:"server.health", title:"Server health", mutating:false, inputKeys:[], executor:"ssh", risk:0, targetTypes:["windows","linux"], timeoutMs:60_000, approvalMode:"none", verification:"health fields present", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"disk.check", title:"Disk check", mutating:false, inputKeys:[], executor:"ssh", risk:0, targetTypes:["windows","linux"], timeoutMs:60_000, approvalMode:"none", verification:"disk data present", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"sql.health", title:"SQL health", mutating:false, inputKeys:[], executor:"sql", risk:0, targetTypes:["database"], timeoutMs:45_000, approvalMode:"none", verification:"database ONLINE", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"sql.backup", title:"SQL backup", mutating:true, inputKeys:[], executor:"sql", risk:2, targetTypes:["database"], timeoutMs:2_700_000, approvalMode:"single", verification:"file exists and verification passes", lockingStrategy:"target-runbook", idempotencyStrategy:"request-id" },
  { id:"mailcow.health", title:"Mailcow health", mutating:false, inputKeys:[], executor:"docker", risk:0, targetTypes:["linux"], timeoutMs:120_000, approvalMode:"none", verification:"container states returned", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"mikrotik.status", title:"MikroTik status", mutating:false, inputKeys:[], executor:"routeros", risk:0, targetTypes:["mikrotik"], timeoutMs:30_000, approvalMode:"none", verification:"interfaces and routes returned", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"wireguard.status", title:"WireGuard status", mutating:false, inputKeys:[], executor:"routeros", risk:0, targetTypes:["mikrotik"], timeoutMs:30_000, approvalMode:"none", verification:"peer status returned", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"onec.read", title:"1C source read", mutating:false, inputKeys:[], executor:"file-onec", risk:0, targetTypes:["onec-export"], timeoutMs:30_000, approvalMode:"none", verification:"source object resolved", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"onec.query", title:"1C query review", mutating:false, inputKeys:[], executor:"file-onec", risk:0, targetTypes:["onec-export"], timeoutMs:30_000, approvalMode:"none", verification:"query validation report returned", lockingStrategy:"none", idempotencyStrategy:"request-id" },
  { id:"onec.patch", title:"1C source patch", mutating:true, inputKeys:[], executor:"file-onec", risk:2, targetTypes:["onec-export"], timeoutMs:600_000, approvalMode:"single", verification:"diff and BSL validation returned", lockingStrategy:"target-runbook", idempotencyStrategy:"request-id" },
  { id:"github.ci", title:"GitHub CI diagnostics", mutating:false, inputKeys:[], executor:"mock", risk:0, targetTypes:["repository"], timeoutMs:30_000, approvalMode:"none", verification:"workflow status returned by configured connector", lockingStrategy:"none", idempotencyStrategy:"request-id" },
];

const LEGACY = new Map<string, string>([
  ["check_windows_server","server.health"],["check_domain_controller","server.health"],["check_1c","server.health"],["check_linux_server","server.health"],
  ["check_disk","disk.check"],["check_sql_database","sql.health"],["backup_sql_database","sql.backup"],["check_mailcow","mailcow.health"],["check_docker","mailcow.health"],
  ["check_mikrotik","mikrotik.status"],["check_wireguard","wireguard.status"],["read_1c_code","onec.read"],["review_1c_query","onec.query"],
  ["patch_1c_extension","onec.patch"],["git_ci_diagnostics","github.ci"],
]);

export class RunbookRegistry {
  private readonly byId = new Map(RUNBOOKS.map((item) => [item.id, item]));
  get(id: string | null | undefined): RunbookDefinition | null {
    if (!id) return null;
    const canonical = LEGACY.get(id) ?? id;
    return this.byId.get(canonical) ?? null;
  }
  list(): RunbookDefinition[] {
    return [...this.byId.values()].map((item) => ({ ...item, inputKeys:[...item.inputKeys], targetTypes:[...item.targetTypes] }));
  }
}
