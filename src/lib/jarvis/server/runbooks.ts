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

type ReadOnlyBook = Pick<Runbook, "id" | "title" | "executor" | "targets" | "inputSchema" | "timeoutSec" | "verification">;
type DeniedBook = Pick<Runbook, "id" | "title" | "executor" | "targets" | "inputSchema">;
type ChangeBook = Pick<Runbook, "id" | "title" | "executor" | "targets" | "inputSchema" | "timeoutSec" | "verification" | "lock" | "idempotent">;

function readOnly(book: ReadOnlyBook): Runbook {
  return {
    ...book,
    risk: 0,
    mutates: false,
    policy: "ALLOW",
    approval: "none",
    lock: null,
    lockingStrategy: "none",
    idempotent: true,
    idempotencyStrategy: "request-id",
  };
}

function alwaysDenied(book: DeniedBook): Runbook {
  return {
    ...book,
    risk: 3,
    mutates: true,
    policy: "DENY_ALWAYS",
    timeoutSec: 0,
    approval: "none",
    verification: "never executed",
    lock: null,
    lockingStrategy: "none",
    idempotent: false,
    idempotencyStrategy: "request-id",
  };
}

function needsApproval(book: ChangeBook): Runbook {
  return {
    ...book,
    risk: 2,
    mutates: true,
    policy: "APPROVAL_REQUIRED",
    approval: "single",
    lockingStrategy: "target-runbook",
    idempotencyStrategy: "request-id",
  };
}

const BOOKS: Runbook[] = [
  readOnly({
    id: "server.health",
    title: "Состояние сервера",
    executor: "ssh",
    targets: ["fleet", "dc01", "srv1c01", "sql01", "fs01", "mail01"],
    inputSchema: ["target"],
    timeoutSec: 60,
    verification: "uptime/cpu/memory/disk/service status",
  }),
  readOnly({
    id: "disk.check",
    title: "Место на дисках",
    executor: "ssh",
    targets: ["fleet", "dc01", "srv1c01", "sql01", "fs01", "mail01"],
    inputSchema: ["target"],
    timeoutSec: 60,
    verification: "disk utilization returned",
  }),
  readOnly({
    id: "sql.health",
    title: "Состояние SQL",
    executor: "sql",
    targets: ["utp"],
    inputSchema: ["database inventory id"],
    timeoutSec: 60,
    verification: "state_desc=ONLINE",
  }),
  needsApproval({
    id: "sql.backup",
    title: "Резервная копия SQL",
    executor: "sql",
    targets: ["utp"],
    inputSchema: ["database inventory id", "server configured destination"],
    timeoutSec: 3600,
    verification: "backup exists, size>0, RESTORE VERIFYONLY",
    lock: "backup",
    idempotent: true,
  }),
  readOnly({
    id: "mailcow.health",
    title: "Mailcow health",
    executor: "docker",
    targets: ["mail01"],
    inputSchema: ["target"],
    timeoutSec: 90,
    verification: "compose services and queue returned",
  }),
  readOnly({
    id: "mikrotik.status",
    title: "MikroTik status",
    executor: "routeros",
    targets: ["rb5009"],
    inputSchema: ["router inventory id"],
    timeoutSec: 30,
    verification: "interfaces/routes returned",
  }),
  readOnly({
    id: "wireguard.status",
    title: "WireGuard status",
    executor: "routeros",
    targets: ["wg"],
    inputSchema: ["vpn inventory id"],
    timeoutSec: 30,
    verification: "peer handshake/status returned",
  }),
  readOnly({
    id: "github.ci",
    title: "GitHub CI diagnostics",
    executor: "mock",
    targets: ["repo-honey"],
    inputSchema: ["repository inventory id"],
    timeoutSec: 30,
    verification: "configured provider returns workflow status",
  }),

  alwaysDenied({
    id: "database.drop",
    title: "Удаление базы",
    executor: "sql",
    targets: ["utp"],
    inputSchema: ["database"],
  }),
  alwaysDenied({
    id: "git.push",
    title: "Push main/master",
    executor: "mock",
    targets: [],
    inputSchema: ["repository", "branch"],
  }),
  alwaysDenied({
    id: "shell.production",
    title: "Arbitrary production shell",
    executor: "mock",
    targets: [],
    inputSchema: ["command"],
  }),
  alwaysDenied({
    id: "onec.exec",
    title: "Выполнить()",
    executor: "onec-file",
    targets: ["jarvis-dev"],
    inputSchema: ["source"],
  }),
  alwaysDenied({
    id: "onec.load",
    title: "Production CF deployment",
    executor: "onec-file",
    targets: ["srv1c01"],
    inputSchema: ["cf"],
  }),

  readOnly({
    id: "onec.read",
    title: "Чтение выгрузки 1С",
    executor: "onec-file",
    targets: ["jarvis-dev"],
    inputSchema: ["object/module"],
    timeoutSec: 60,
    verification: "source object resolved",
  }),
  readOnly({
    id: "onec.query",
    title: "Разбор запроса 1С",
    executor: "onec-file",
    targets: ["jarvis-dev"],
    inputSchema: ["query text"],
    timeoutSec: 60,
    verification: "validation report returned",
  }),
  needsApproval({
    id: "onec.patch",
    title: "Правка расширения",
    executor: "onec-file",
    targets: ["jarvis-dev"],
    inputSchema: ["object/module", "branch", "structured source patch"],
    timeoutSec: 300,
    verification: "diff plus BSL validation",
    lock: "onec",
    idempotent: false,
  }),
  needsApproval({
    id: "onec.form",
    title: "Форма/макет/отчёт/обработка 1С",
    executor: "onec-file",
    targets: ["jarvis-dev"],
    inputSchema: ["object kind", "name", "branch"],
    timeoutSec: 300,
    verification: "export representation and diff exist",
    lock: "onec",
    idempotent: false,
  }),
];

const RUNBOOK_BY_INTENT: Record<string, string> = {
  check_fleet: "server.health",
  check_disk: "disk.check",
  check_sql_database: "sql.health",
  backup_utp: "sql.backup",
  database_backup: "sql.backup",
  check_mailcow: "mailcow.health",
  check_docker: "mailcow.health",
  check_mikrotik: "mikrotik.status",
  check_wireguard: "wireguard.status",
  git_ci: "github.ci",
  drop_database: "database.drop",
  delete_db: "database.drop",
  push_main: "git.push",
  load_1c_cf: "onec.load",
  read_1c_code: "onec.read",
  review_1c_query: "onec.query",
  trace_1c: "onec.read",
  patch_1c: "onec.patch",
  onec_dev: "onec.form",
};

export function runbookById(id: string): Runbook | null {
  return BOOKS.find((book) => book.id === id) ?? null;
}

export function runbookForIntent(normalized: string): Runbook | null {
  const id = RUNBOOK_BY_INTENT[normalized];
  return id ? runbookById(id) : null;
}

export function listRunbooks(): Runbook[] {
  return BOOKS.map((book) => ({
    ...book,
    targets: [...book.targets],
    inputSchema: [...book.inputSchema],
  }));
}
