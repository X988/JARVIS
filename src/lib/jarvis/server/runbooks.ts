export type PolicyName = "ALLOW" | "APPROVAL_REQUIRED" | "DENY_ALWAYS";

export type Runbook = {
  id: string;
  title: string;
  executor: "mock" | "powershell" | "ssh" | "sql" | "routeros" | "docker" | "onec-file";
  risk: 0 | 1 | 2 | 3;
  mutates: boolean;
  policy: PolicyName;
  targets: string[];
  inputSchema: string[];
  timeoutSec: number;
  approval: "none" | "single" | "double";
  verification: string;
  lock: string | null;
  lockingStrategy: "none" | "target" | "target-runbook";
  idempotent: boolean;
  idempotencyStrategy: "request-id";
};

const BOOKS: Runbook[] = [
  { id:"server.health", title:"Состояние сервера", executor:"ssh", risk:0, mutates:false, policy:"ALLOW", targets:["fleet","dc01","srv1c01","sql01","fs01","mail01"], inputSchema:["target"], timeoutSec:60, approval:"none", verification:"uptime/cpu/memory/disk/service status", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"disk.check", title:"Место на дисках", executor:"ssh", risk:0, mutates:false, policy:"ALLOW", targets:["fleet","dc01","srv1c01","sql01","fs01","mail01"], inputSchema:["target"], timeoutSec:60, approval:"none", verification:"disk utilization returned", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"sql.health", title:"Состояние SQL", executor:"sql", risk:0, mutates:false, policy:"ALLOW", targets:["utp"], inputSchema:["database inventory id"], timeoutSec:60, approval:"none", verification:"state_desc=ONLINE", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"sql.backup", title:"Резервная копия SQL", executor:"sql", risk:2, mutates:true, policy:"APPROVAL_REQUIRED", targets:["utp"], inputSchema:["database inventory id","server configured destination"], timeoutSec:3600, approval:"single", verification:"backup exists, size>0, RESTORE VERIFYONLY", lock:"backup", lockingStrategy:"target-runbook", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"mailcow.health", title:"Mailcow health", executor:"docker", risk:0, mutates:false, policy:"ALLOW", targets:["mail01"], inputSchema:["target"], timeoutSec:90, approval:"none", verification:"compose services and queue returned", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"mikrotik.status", title:"MikroTik status", executor:"routeros", risk:0, mutates:false, policy:"ALLOW", targets:["rb5009"], inputSchema:["router inventory id"], timeoutSec:30, approval:"none", verification:"interfaces/routes returned", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"wireguard.status", title:"WireGuard status", executor:"routeros", risk:0, mutates:false, policy:"ALLOW", targets:["wg"], inputSchema:["vpn inventory id"], timeoutSec:30, approval:"none", verification:"peer handshake/status returned", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"github.ci", title:"GitHub CI diagnostics", executor:"mock", risk:0, mutates:false, policy:"ALLOW", targets:["repo-honey"], inputSchema:["repository inventory id"], timeoutSec:30, approval:"none", verification:"configured provider returns workflow status", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },

  { id:"database.drop", title:"Удаление базы", executor:"sql", risk:3, mutates:true, policy:"DENY_ALWAYS", targets:["utp"], inputSchema:["database"], timeoutSec:0, approval:"none", verification:"never executed", lock:null, lockingStrategy:"none", idempotent:false, idempotencyStrategy:"request-id" },
  { id:"git.push", title:"Push main/master", executor:"mock", risk:3, mutates:true, policy:"DENY_ALWAYS", targets:[], inputSchema:["repository","branch"], timeoutSec:0, approval:"none", verification:"never executed", lock:null, lockingStrategy:"none", idempotent:false, idempotencyStrategy:"request-id" },
  { id:"shell.production", title:"Arbitrary production shell", executor:"mock", risk:3, mutates:true, policy:"DENY_ALWAYS", targets:[], inputSchema:["command"], timeoutSec:0, approval:"none", verification:"never executed", lock:null, lockingStrategy:"none", idempotent:false, idempotencyStrategy:"request-id" },
  { id:"onec.exec", title:"Выполнить()", executor:"onec-file", risk:3, mutates:true, policy:"DENY_ALWAYS", targets:["jarvis-dev"], inputSchema:["source"], timeoutSec:0, approval:"none", verification:"never executed", lock:null, lockingStrategy:"none", idempotent:false, idempotencyStrategy:"request-id" },
  { id:"onec.load", title:"Production CF deployment", executor:"onec-file", risk:3, mutates:true, policy:"DENY_ALWAYS", targets:["srv1c01"], inputSchema:["cf"], timeoutSec:0, approval:"none", verification:"never executed", lock:null, lockingStrategy:"none", idempotent:false, idempotencyStrategy:"request-id" },

  { id:"onec.read", title:"Чтение выгрузки 1С", executor:"onec-file", risk:0, mutates:false, policy:"ALLOW", targets:["jarvis-dev"], inputSchema:["object/module"], timeoutSec:60, approval:"none", verification:"source object resolved", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"onec.query", title:"Разбор запроса 1С", executor:"onec-file", risk:0, mutates:false, policy:"ALLOW", targets:["jarvis-dev"], inputSchema:["query text"], timeoutSec:60, approval:"none", verification:"validation report returned", lock:null, lockingStrategy:"none", idempotent:true, idempotencyStrategy:"request-id" },
  { id:"onec.patch", title:"Правка расширения", executor:"onec-file", risk:2, mutates:true, policy:"APPROVAL_REQUIRED", targets:["jarvis-dev"], inputSchema:["object/module","branch","structured source patch"], timeoutSec:300, approval:"single", verification:"diff plus BSL validation", lock:"onec", lockingStrategy:"target-runbook", idempotent:false, idempotencyStrategy:"request-id" },
  { id:"onec.form", title:"Форма/макет/отчёт/обработка 1С", executor:"onec-file", risk:2, mutates:true, policy:"APPROVAL_REQUIRED", targets:["jarvis-dev"], inputSchema:["object kind","name","branch"], timeoutSec:300, approval:"single", verification:"export representation and diff exist", lock:"onec", lockingStrategy:"target-runbook", idempotent:false, idempotencyStrategy:"request-id" },
];

const BY_INTENT:Record<string,string>={
  check_fleet:"server.health",
  check_disk:"disk.check",
  check_sql_database:"sql.health",
  backup_utp:"sql.backup",
  database_backup:"sql.backup",
  check_mailcow:"mailcow.health",
  check_docker:"mailcow.health",
  check_mikrotik:"mikrotik.status",
  check_wireguard:"wireguard.status",
  git_ci:"github.ci",
  drop_database:"database.drop",
  delete_db:"database.drop",
  push_main:"git.push",
  load_1c_cf:"onec.load",
  read_1c_code:"onec.read",
  review_1c_query:"onec.query",
  trace_1c:"onec.read",
  patch_1c:"onec.patch",
  onec_dev:"onec.form",
};

export function runbookById(id:string):Runbook|null{
  return BOOKS.find((item)=>item.id===id) ?? null;
}

export function runbookForIntent(normalized:string):Runbook|null{
  const id=BY_INTENT[normalized];
  return id?runbookById(id):null;
}

export function listRunbooks():Runbook[]{
  return BOOKS.map((book)=>({...book,targets:[...book.targets],inputSchema:[...book.inputSchema]}));
}
