export type PolicyName = "ALLOW" | "APPROVAL_REQUIRED" | "DENY_ALWAYS";

export type Runbook = {
  id: string;
  title: string;
  executor: "mock" | "powershell" | "ssh" | "sql" | "routeros" | "docker" | "onec-file";
  risk: 0 | 1 | 2 | 3;
  mutates: boolean;
  policy: PolicyName;
  targets: string[];
  timeoutSec: number;
  approval: "none" | "single" | "double";
  verification: string;
  lock: string | null;
  idempotent: boolean;
};

const BOOKS: Runbook[] = [
  { id: "server.health", title: "Состояние сервера", executor: "ssh", risk: 0, mutates: false, policy: "ALLOW", targets: ["fleet", "dc01", "srv1c01", "sql01", "mail01"], timeoutSec: 60, approval: "none", verification: "ответ read-only", lock: null, idempotent: true },
  { id: "disk.check", title: "Место на дисках", executor: "ssh", risk: 0, mutates: false, policy: "ALLOW", targets: ["fleet"], timeoutSec: 60, approval: "none", verification: "процент по томам", lock: null, idempotent: true },
  { id: "sql.health", title: "Состояние SQL", executor: "sql", risk: 0, mutates: false, policy: "ALLOW", targets: ["sql01", "utp"], timeoutSec: 60, approval: "none", verification: "ONLINE", lock: null, idempotent: true },
  { id: "sql.backup", title: "Резервная копия SQL", executor: "sql", risk: 2, mutates: true, policy: "APPROVAL_REQUIRED", targets: ["utp"], timeoutSec: 3600, approval: "single", verification: "файл есть, размер больше нуля, RESTORE VERIFYONLY", lock: "backup", idempotent: true },
  { id: "mailcow.health", title: "Почта", executor: "ssh", risk: 0, mutates: false, policy: "ALLOW", targets: ["mail01"], timeoutSec: 60, approval: "none", verification: "контейнеры и очередь", lock: null, idempotent: true },
  { id: "mikrotik.status", title: "MikroTik", executor: "routeros", risk: 0, mutates: false, policy: "ALLOW", targets: ["rb5009"], timeoutSec: 30, approval: "none", verification: "интерфейсы", lock: null, idempotent: true },
  { id: "wireguard.status", title: "WireGuard", executor: "ssh", risk: 0, mutates: false, policy: "ALLOW", targets: ["wg"], timeoutSec: 30, approval: "none", verification: "handshake", lock: null, idempotent: true },
  { id: "database.drop", title: "Удаление базы", executor: "sql", risk: 3, mutates: true, policy: "DENY_ALWAYS", targets: ["utp"], timeoutSec: 0, approval: "none", verification: "не выполняется", lock: null, idempotent: false },
  { id: "git.push", title: "Push", executor: "mock", risk: 3, mutates: true, policy: "DENY_ALWAYS", targets: [], timeoutSec: 0, approval: "none", verification: "не выполняется", lock: null, idempotent: false },
  { id: "onec.exec", title: "Выполнить()", executor: "onec-file", risk: 3, mutates: true, policy: "DENY_ALWAYS", targets: ["jarvis-dev"], timeoutSec: 0, approval: "none", verification: "не выполняется", lock: null, idempotent: false },
  { id: "onec.load", title: "Загрузка CF", executor: "onec-file", risk: 3, mutates: true, policy: "DENY_ALWAYS", targets: ["srv1c01"], timeoutSec: 0, approval: "none", verification: "не выполняется", lock: null, idempotent: false },
  { id: "onec.read", title: "Чтение выгрузки 1С", executor: "onec-file", risk: 0, mutates: false, policy: "ALLOW", targets: ["jarvis-dev", "srv1c01"], timeoutSec: 60, approval: "none", verification: "файл прочитан", lock: null, idempotent: true },
  { id: "onec.patch", title: "Правка расширения", executor: "onec-file", risk: 2, mutates: true, policy: "APPROVAL_REQUIRED", targets: ["jarvis-dev"], timeoutSec: 300, approval: "single", verification: "diff и fallback BSL", lock: "onec", idempotent: false },
  { id: "onec.form", title: "Форма расширения", executor: "onec-file", risk: 2, mutates: true, policy: "APPROVAL_REQUIRED", targets: ["jarvis-dev"], timeoutSec: 300, approval: "single", verification: "объект есть в выгрузке", lock: "onec", idempotent: false },
];

const BY_INTENT: Record<string, string> = {
  check_fleet: "server.health",
  check_disk: "disk.check",
  check_sql_database: "sql.health",
  database_backup: "sql.backup",
  check_mailcow: "mailcow.health",
  check_mikrotik: "mikrotik.status",
  check_wireguard: "wireguard.status",
  drop_database: "database.drop",
  push_main: "git.push",
  load_1c_cf: "onec.load",
  read_1c_code: "onec.read",
  review_1c_query: "onec.read",
  trace_1c: "onec.read",
  patch_1c: "onec.patch",
  onec_dev: "onec.form",
};

export function runbookById(id: string): Runbook | null {
  return BOOKS.find((item) => item.id === id) ?? null;
}

export function runbookForIntent(normalized: string): Runbook | null {
  const id = BY_INTENT[normalized];
  return id ? runbookById(id) : null;
}

export function listRunbooks(): Runbook[] {
  return BOOKS;
}
