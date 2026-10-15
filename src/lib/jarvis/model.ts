import { ONEC_DEV, classifyOnecDeveloper, onecDevAdapter, type DevPlan } from "./onec-dev.ts";
import { DEMO_ACTORS, type Actor, type Role } from "./tools/actors.ts";
export type Risk = 0 | 1 | 2 | 3;
export type Verdict = "allow" | "deny" | "clarify";
export type FindingState = "ok" | "warn" | "bad" | "info";

export type Finding = {
  label: string;
  state: FindingState;
  detail: string;
};

export type OperatorRole = Role;
export type Operator = Actor;

export { ONEC_DEV };

export type IntentId =
  | "check_fleet"
  | "check_1c"
  | "check_sql"
  | "check_dc"
  | "check_mailcow"
  | "check_docker"
  | "check_disk"
  | "check_wireguard"
  | "check_mikrotik"
  | "check_wan"
  | "backup_utp"
  | "backup_mikrotik"
  | "restart_1c"
  | "reboot_dc"
  | "reboot_ambiguous"
  | "restart_ambiguous"
  | "daily_report"
  | "why_1c"
  | "coding"
  | "git_ci"
  | "rollback_project"
  | "clean_server"
  | "push_main"
  | "delete_db"
  | "read_1c_code"
  | "review_1c_query"
  | "trace_1c"
  | "patch_1c"
  | "load_1c_cf"
  | "provision_1c_admin"
  | "onec_dev"
  | "unknown";

export type Spec = {
  id: IntentId;
  title: string;
  normalized: string;
  risk: Risk;
  tool: string;
  target: string;
  runbook: string | null;
  account: string;
  parameters: { key: string; value: string }[];
  confirmation: "none" | "single" | "double";
  mutation: boolean;
  forceDeny: boolean;
  clarify: boolean;
  denyReason: string | null;
  clarifyReason: string | null;
  plan: string[];
  toolCall: string;
  consequences: string[];
  findings: Finding[];
  recommendation: string | null;
  durationMs: number;
};

export type Decision = Spec & {
  verdict: Verdict;
  reason: string | null;
  policyNotes: string[];
  previewFindings: boolean;
};

export const RISK_LABEL: Record<Risk, string> = {
  0: "чтение",
  1: "низкий",
  2: "изменение",
  3: "критический",
};

export const OPERATORS: Operator[] = DEMO_ACTORS;

export const SUGGESTIONS: { label: string; text: string; readOnly: boolean }[] = [
  { label: "SSH uptime", text: "ssh mail01 uptime", readOnly: true },
  { label: "Интерфейсы", text: "Покажи интерфейсы MikroTik", readOnly: true },
  { label: "Загрузка роутера", text: "Какая загрузка роутера?", readOnly: true },
  { label: "Выключи ether2", text: "Выключи интерфейс ether2 на MikroTik", readOnly: false },
  { label: "Проверь сервер", text: "Проверь сервер", readOnly: true },
  { label: "Backup utp", text: "Сделай резервную копию базы utp", readOnly: false },
  { label: "Mailcow", text: "Проверь Mailcow", readOnly: true },
  { label: "План", text: "Проверь Mailcow и место на дисках, ничего не меняй", readOnly: true },
  { label: "Место", text: "Проверь свободное место на всех серверах", readOnly: true },
  { label: "Служба 1С", text: "Перезапусти службу 1С", readOnly: false },
  { label: "Ребут DC", text: "Перезагрузи контроллер домена", readOnly: false },
  { label: "Почисти сервер", text: "Почисти сервер", readOnly: false },
  { label: "Push в main", text: "Запушь исправление в main", readOnly: false },
  { label: "Удали базу", text: "Удали базу utp", readOnly: false },
  { label: "1С не пускает", text: "Почему пользователи не заходят в 1С", readOnly: true },
  { label: "Модуль 1С", text: "Посмотри модуль проведения в расширении", readOnly: true },
  { label: "Запрос 1С", text: "Проверь запрос к регистру накопления", readOnly: true },
  { label: "Правка 1С", text: "Исправь запрос в расширении и не загружай в рабочую", readOnly: false },
  { label: "Форма 1С", text: "Создай управляемую форму в расширении", readOnly: false },
  { label: "Анализ 1С", text: "Запусти статический анализ расширения", readOnly: true },
];

export const VOICE_PRESETS: { id: string; text: string; length: string }[] = [
  { id: "fleet", text: "Джарвис, проверь сервер", length: "0:02" },
  { id: "backup", text: "Джарвис, сделай резервную копию базы utp", length: "0:04" },
  { id: "mail", text: "Проверь Mailcow", length: "0:02" },
  { id: "wan", text: "Почему не работает резервный интернет", length: "0:03" },
  { id: "restart", text: "Перезапусти службу 1С", length: "0:02" },
];

export type Server = {
  id: string;
  type: string;
  roles: string[];
  note: string;
};

export const SERVERS: Server[] = [
  { id: "dc01", type: "Windows", roles: ["domain controller", "DNS", "DHCP"], note: "запись отдельно от изменений" },
  { id: "srv1c01", type: "Windows", roles: ["1С"], note: "кластер, порты 1540–1541" },
  { id: "sql01", type: "Windows", roles: ["SQL Server"], note: "база utp, учётка jarvis-sql" },
  { id: "fs01", type: "Windows", roles: ["файлы", "SMB"], note: "общие каталоги" },
  { id: "mail01", type: "Linux", roles: ["Mailcow"], note: "docker compose" },
  { id: "rb5009", type: "MikroTik", roles: ["шлюз", "WireGuard"], note: "API-SSL, не SSH по умолчанию" },
];

export type Runbook = {
  id: string;
  title: string;
  description: string;
  inputs: string;
  validation: string;
  risk: Risk;
  targets: string;
  executor: string;
  timeout: string;
  rollback: string;
  verification: string;
};

export const RUNBOOKS: Runbook[] = [
  { id: "check_windows_server", title: "Проверка Windows", description: "Службы, диск, CPU, RAM, сеть. Без изменений.", inputs: "server", validation: "хост есть в inventory", risk: 0, targets: "dc01, srv1c01, sql01, fs01", executor: "semaphore / WinRM", timeout: "60 с", rollback: "не нужен", verification: "ответы служб и счётчиков" },
  { id: "check_domain_controller", title: "Проверка DC", description: "Репликация, DNS, DHCP, Netlogon. Без Domain Admin.", inputs: "server", validation: "роль domain_controller", risk: 0, targets: "dc01", executor: "jarvis-windows, read", timeout: "90 с", rollback: "не нужен", verification: "repadmin и службы AD" },
  { id: "check_1c", title: "Проверка 1С", description: "ragent, rmngr, ras, лицензии, сессии, связь с SQL.", inputs: "server", validation: "роль 1c", risk: 0, targets: "srv1c01", executor: "semaphore", timeout: "90 с", rollback: "не нужен", verification: "службы running, порт слушает" },
  { id: "check_sql_database", title: "Проверка базы", description: "ONLINE, размер, последний backup, активные сессии.", inputs: "server, database", validation: "база в allowlist", risk: 0, targets: "sql01", executor: "jarvis-sql", timeout: "45 с", rollback: "не нужен", verification: "state_desc = ONLINE" },
  { id: "check_linux_server", title: "Проверка Linux", description: "systemctl, диск, память, firewall. Ansible вместо сырого shell.", inputs: "server", validation: "тип linux", risk: 0, targets: "mail01", executor: "ansible / jarvis-linux", timeout: "60 с", rollback: "не нужен", verification: "модули ansible без failed" },
  { id: "check_docker", title: "Проверка Docker", description: "compose ps, рестарты, место образов.", inputs: "server", validation: "docker доступен учётка", risk: 0, targets: "mail01", executor: "ansible", timeout: "45 с", rollback: "не нужен", verification: "список контейнеров" },
  { id: "check_mailcow", title: "Проверка Mailcow", description: "Разбор сервисов, а не дамп логов.", inputs: "server", validation: "роль mailcow", risk: 0, targets: "mail01", executor: "ansible", timeout: "2 мин", rollback: "не нужен", verification: "статус каждого сервиса" },
  { id: "check_disk", title: "Место на дисках", description: "Свободное место по всем серверам inventory.", inputs: "scope", validation: "inventory не пуст", risk: 0, targets: "все", executor: "semaphore", timeout: "2 мин", rollback: "не нужен", verification: "процент по каждому тому" },
  { id: "check_mikrotik", title: "Диагностика MikroTik", description: "Интерфейсы, маршруты, NAT, DHCP, DNS. Только чтение.", inputs: "router", validation: "API доступен", risk: 0, targets: "rb5009", executor: "jarvis-mikrotik", timeout: "30 с", rollback: "не нужен", verification: "снимок интерфейсов" },
  { id: "check_wireguard", title: "WireGuard", description: "Handshake и peer status. Без изменения peer.", inputs: "router", validation: "интерфейс wg есть", risk: 0, targets: "rb5009", executor: "RouterOS API", timeout: "20 с", rollback: "не нужен", verification: "last-handshake" },
  { id: "backup_sql_database", title: "Backup базы SQL", description: "Утверждённый шаблон, не новый PowerShell из модели.", inputs: "server, database, destination", validation: "ONLINE, место, нет другого backup", risk: 1, targets: "sql01", executor: "jarvis-backup", timeout: "45 мин", rollback: "снять незавершённый файл", verification: "размер, checksum, RESTORE VERIFYONLY" },
  { id: "backup_mikrotik", title: "Export MikroTik", description: "Сначала копия конфигурации. Правила не меняются.", inputs: "router", validation: "API read+backup", risk: 1, targets: "rb5009", executor: "jarvis-mikrotik", timeout: "2 мин", rollback: "файл export можно удалить", verification: "файл export сохранён" },
  { id: "restart_service", title: "Рестарт службы", description: "Только служба из allowlist.", inputs: "server, service", validation: "служба разрешена", risk: 2, targets: "srv1c01", executor: "semaphore", timeout: "3 мин", rollback: "запустить службу снова", verification: "state running и порт" },
  { id: "restart_1c", title: "Рестарт агента 1С", description: "Короткий разрыв сессий кластера.", inputs: "server", validation: "нет запрета в окне без approval", risk: 2, targets: "srv1c01", executor: "semaphore", timeout: "5 мин", rollback: "старт ragent", verification: "1540 слушает" },
  { id: "deploy_project", title: "Деплой", description: "Только после тестов и approval. Не в main напрямую.", inputs: "repo, ref", validation: "ветка не main", risk: 2, targets: "разрешённые repo", executor: "coding-agent", timeout: "20 мин", rollback: "предыдущий релиз", verification: "health после выкладки" },
  { id: "rollback_project", title: "Откат релиза", description: "Вернуть предыдущий артефакт. Требует подтверждения.", inputs: "repo, release", validation: "есть предыдущий релиз", risk: 2, targets: "billing", executor: "semaphore", timeout: "15 мин", rollback: "повторный деплой текущего", verification: "версия и health" },
  { id: "git_ci_diagnostics", title: "Разбор CI", description: "Статус workflow, упавший job, без push.", inputs: "repo", validation: "repo в allowlist", risk: 0, targets: "company/billing", executor: "jarvis-github", timeout: "30 с", rollback: "не нужен", verification: "имя job и ошибка" },
  { id: "read_1c_code", title: "1С: модуль", description: "Чтение модуля расширения. Без выгрузки в базу и без выполнения кода.", inputs: "extension, module", validation: "объект есть в расширении", risk: 0, targets: "расширение utp", executor: "jarvis-1c-reader", timeout: "30 с", rollback: "не нужен", verification: "имя модуля и процедура" },
  { id: "review_1c_query", title: "1С: запрос", description: "Разбор текста запроса: соединения, параметры, виртуальные таблицы.", inputs: "query", validation: "текст запроса, не выполнение", risk: 0, targets: "расширение utp", executor: "jarvis-1c-reader", timeout: "20 с", rollback: "не нужен", verification: "замечания по тексту" },
  { id: "patch_1c_extension", title: "1С: правка расширения", description: "Diff в ветке расширения. Рабочая база и CF не обновляются.", inputs: "module, branch", validation: "не основная конфигурация", risk: 2, targets: "расширение utp", executor: "jarvis-1c-reader", timeout: "10 мин", rollback: "ветку не мержить", verification: "синтаксис и diff" },
];

export const ACCOUNTS: { id: string; scope: string }[] = [
  { id: "jarvis-linux", scope: "SSH и Ansible, без sudo на всё" },
  { id: "jarvis-windows", scope: "WinRM, чтение и узкий restart" },
  { id: "jarvis-sql", scope: "backup и чтение, не sysadmin" },
  { id: "jarvis-backup", scope: "запись только в каталог backup" },
  { id: "jarvis-mikrotik", scope: "API read, backup отдельным правом" },
  { id: "jarvis-github", scope: "чтение CI, PR без права на main" },
  { id: "jarvis-1c-reader", scope: "журнал, метаданные, модули, git-ветка и diff. Не production." },
  { id: "jarvis-1c-dev", scope: ONEC_DEV.scope },
];

export const ONEC_READER = {
  id: "jarvis-1c-reader",
  allow: [
    "журнал регистрации",
    "metadata",
    "анализ модулей",
    "чтение логов",
    "поиск ошибки",
    "git clone",
    "создание branch",
    "diff",
    "tests",
  ],
  deny: [
    "загрузка CF в production",
    "обновление конфигурации БД",
    "Выполнить()",
    "произвольный COM-вызов",
    "изменение production DB",
  ],
};

export const SERVICES: { name: string; state: string }[] = [
  { name: "PostgreSQL", state: "модель" },
  { name: "Redis", state: "модель" },
  { name: "Whisper", state: "модель" },
  { name: "Semaphore", state: "модель" },
  { name: "Telegram", state: "модель" },
  { name: "worker", state: "модель" },
];

const FLEET: Finding[] = [
  { label: "dc01", state: "ok", detail: "AD, DNS и DHCP отвечают. Репликация без отставания." },
  { label: "srv1c01", state: "ok", detail: "ragent и rmngr запущены. Сессий: 14." },
  { label: "sql01", state: "ok", detail: "База utp в состоянии ONLINE." },
  { label: "fs01", state: "ok", detail: "Том E: занято 62%." },
  { label: "mail01", state: "warn", detail: "Почта жива. Сертификат ACME не продлился." },
  { label: "rb5009", state: "warn", detail: "Основной канал поднят. Резервный LTE молчит 14 ч." },
];

function spec(partial: Spec): Spec {
  return partial;
}

const SPECS: Record<IntentId, Spec> = {
  check_fleet: spec({
    id: "check_fleet",
    title: "Состояние площадки",
    normalized: "check_fleet",
    risk: 0,
    tool: "check_servers",
    target: "inventory",
    runbook: "check_windows_server",
    account: "jarvis-windows / jarvis-linux",
    parameters: [{ key: "scope", value: "all" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Сверить цели с inventory, не с текстом модели.",
      "Опросить службы, диск и доступность. Ничего не менять.",
      "Собрать короткие выводы по каждому узлу.",
    ],
    toolCall: 'check_servers(scope: "all")',
    consequences: ["Только чтение. Сессии и маршруты не затрагиваются."],
    findings: FLEET,
    recommendation: "Имеет смысл отдельно открыть Mailcow и резервный канал: там предупреждения.",
    durationMs: 2400,
  }),
  check_1c: spec({
    id: "check_1c",
    title: "Сервер 1С",
    normalized: "check_1c",
    risk: 0,
    tool: "check_1c",
    target: "srv1c01",
    runbook: "check_1c",
    account: "jarvis-windows",
    parameters: [{ key: "server", value: "srv1c01" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Проверить службы кластера.", "Проверить лицензии и порт 1540.", "Проверить, что utp на sql01 ONLINE."],
    toolCall: 'check_1c(server: "srv1c01")',
    consequences: ["Только чтение."],
    findings: [
      { label: "ragent", state: "ok", detail: "Running. Последний рестарт 18 дней назад." },
      { label: "rmngr", state: "ok", detail: "Running. Рабочих процессов: 4." },
      { label: "Лицензии", state: "ok", detail: "Занято 37 из 50." },
      { label: "sql01 / utp", state: "ok", detail: "ONLINE, блокирующих сессий нет." },
      { label: "Диск C:", state: "ok", detail: "Свободно 41%." },
    ],
    recommendation: "Сервер 1С сейчас не выглядит причиной массового отказа. Если не пускает конкретных людей — смотрите сеансы и сеть, не рестарт.",
    durationMs: 1800,
  }),
  check_sql: spec({
    id: "check_sql",
    title: "База utp",
    normalized: "check_sql_database",
    risk: 0,
    tool: "check_database",
    target: "sql01 / utp",
    runbook: "check_sql_database",
    account: "jarvis-sql",
    parameters: [
      { key: "server", value: "sql01" },
      { key: "database", value: "utp" },
    ],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Найти базу в карте баз.", "Прочитать состояние и последний backup.", "Не запускать backup и restore."],
    toolCall: 'check_database(server: "sql01", database: "utp")',
    consequences: ["Только чтение. Резервная копия не создаётся."],
    findings: [
      { label: "Состояние", state: "ok", detail: "ONLINE." },
      { label: "Размер", state: "info", detail: "Данные 18.4 ГБ, журнал 2.1 ГБ." },
      { label: "Последний backup", state: "ok", detail: "Сегодня 02:10, VERIFYONLY прошёл." },
      { label: "Активный backup", state: "ok", detail: "Сейчас не выполняется." },
    ],
    recommendation: "База доступна. Новый backup — отдельная команда.",
    durationMs: 900,
  }),
  check_dc: spec({
    id: "check_dc",
    title: "Контроллер домена",
    normalized: "check_domain_controller",
    risk: 0,
    tool: "check_domain_controller",
    target: "dc01",
    runbook: "check_domain_controller",
    account: "jarvis-windows",
    parameters: [{ key: "server", value: "dc01" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Чтение репликации, DNS и DHCP.", "Не менять группы Domain Admins и GPO."],
    toolCall: 'check_domain_controller(server: "dc01")',
    consequences: ["Только чтение. Учётка не Domain Admin."],
    findings: [
      { label: "Netlogon", state: "ok", detail: "Running." },
      { label: "Репликация", state: "ok", detail: "Отставания нет. Партнёр один, он сам." },
      { label: "DNS", state: "ok", detail: "Зоны AD отвечают." },
      { label: "DHCP", state: "ok", detail: "Пул офиса занят на 71%." },
    ],
    recommendation: "Перезагрузка DC отсюда не предлагается.",
    durationMs: 1600,
  }),
  check_mailcow: spec({
    id: "check_mailcow",
    title: "Mailcow",
    normalized: "check_mailcow",
    risk: 0,
    tool: "check_mailcow",
    target: "mail01",
    runbook: "check_mailcow",
    account: "jarvis-linux",
    parameters: [{ key: "server", value: "mail01" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["compose ps, диск, память.", "Разобрать postfix, dovecot, nginx, acme, redis, sogo.", "Отдать вывод сервисами, не сырым логом."],
    toolCall: 'check_mailcow(server: "mail01")',
    consequences: ["Только чтение. Контейнеры не перезапускаются."],
    findings: [
      { label: "Postfix", state: "ok", detail: "Очередь 3 письма, отказов за час нет." },
      { label: "Dovecot", state: "ok", detail: "IMAP отвечает." },
      { label: "Nginx", state: "ok", detail: "HTTPS слушает." },
      { label: "Redis", state: "ok", detail: "Отвечает на ping." },
      { label: "SOGo", state: "ok", detail: "Контейнер up." },
      { label: "Диск", state: "warn", detail: "Занято 88%. Порог внимания 85%." },
      { label: "ACME", state: "bad", detail: "Продление ночью упало. Сертификат истекает через 9 дней." },
    ],
    recommendation: "Почта сейчас работает. Дальше — место на диске и отдельное подтверждение на renew сертификата. Само renew из этой команды не запускается.",
    durationMs: 2100,
  }),
  check_docker: spec({
    id: "check_docker",
    title: "Docker на mail01",
    normalized: "check_docker",
    risk: 0,
    tool: "check_docker",
    target: "mail01",
    runbook: "check_docker",
    account: "jarvis-linux",
    parameters: [{ key: "server", value: "mail01" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Снять compose ps.", "Не делать prune и не останавливать контейнеры."],
    toolCall: 'check_docker(server: "mail01")',
    consequences: ["Только чтение."],
    findings: [
      { label: "Контейнеры", state: "ok", detail: "11 up." },
      { label: "acme-mailcow", state: "bad", detail: "Restarting. Код выхода прошлого прогона: 1." },
      { label: "Место образов", state: "warn", detail: "Docker root занял 41 ГБ." },
    ],
    recommendation: "Чистка образов была бы изменением. Сначала отчёт, prune только отдельной утверждённой задачей.",
    durationMs: 1200,
  }),
  check_disk: spec({
    id: "check_disk",
    title: "Свободное место",
    normalized: "check_disk",
    risk: 0,
    tool: "check_disk",
    target: "все серверы",
    runbook: "check_disk",
    account: "jarvis-windows / jarvis-linux",
    parameters: [{ key: "scope", value: "all" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Обойти inventory.", "Снять занятость томов.", "Ничего не удалять."],
    toolCall: 'check_disk(scope: "all")',
    consequences: ["Только чтение. Файлы не удаляются."],
    findings: [
      { label: "dc01 C:", state: "ok", detail: "Свободно 48%." },
      { label: "srv1c01 C:", state: "ok", detail: "Свободно 41%." },
      { label: "sql01 E:", state: "ok", detail: "Свободно 36%. Хватает на полный backup utp." },
      { label: "fs01 E:", state: "ok", detail: "Свободно 38%." },
      { label: "mail01 /", state: "warn", detail: "Свободно 12%." },
      { label: "NAS backup", state: "ok", detail: "Свободно 2.4 ТБ." },
    ],
    recommendation: "Критичен только mail01. Очистку не запускаю: команда была про проверку.",
    durationMs: 2000,
  }),
  check_wireguard: spec({
    id: "check_wireguard",
    title: "WireGuard",
    normalized: "check_wireguard",
    risk: 0,
    tool: "check_wireguard",
    target: "rb5009",
    runbook: "check_wireguard",
    account: "jarvis-mikrotik",
    parameters: [{ key: "router", value: "rb5009" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Считать peer и handshake через API.", "Ключи и peer не менять."],
    toolCall: 'check_wireguard(router: "rb5009")',
    consequences: ["Только чтение."],
    findings: [
      { label: "wg-office", state: "ok", detail: "Handshake 12 секунд назад. Туннель жив." },
      { label: "wg-admin", state: "warn", detail: "Peer phone-admin молчит 3 часа." },
    ],
    recommendation: "Это похоже на выключенный телефон, не на поломку интерфейса. Удалять peer нельзя без отдельного подтверждения.",
    durationMs: 700,
  }),
  check_mikrotik: spec({
    id: "check_mikrotik",
    title: "MikroTik",
    normalized: "check_mikrotik",
    risk: 0,
    tool: "check_mikrotik",
    target: "rb5009",
    runbook: "check_mikrotik",
    account: "jarvis-mikrotik",
    parameters: [{ key: "router", value: "rb5009" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["API: интерфейсы, адреса, маршруты, NAT, firewall filter — чтение.", "Перед любой правкой сначала export. Сейчас правки нет."],
    toolCall: 'check_mikrotik(router: "rb5009")',
    consequences: ["Только чтение. Firewall и маршруты не меняются."],
    findings: [
      { label: "ether1", state: "ok", detail: "WAN, link up." },
      { label: "bridge-lan", state: "ok", detail: "Порты офиса up." },
      { label: "Маршрут", state: "ok", detail: "0.0.0.0/0 через ISP-A." },
      { label: "Firewall", state: "info", detail: "Фильтр на месте. Изменений в этой команде нет." },
    ],
    recommendation: "Диагностика спокойная. Любое изменение filter, NAT, VLAN или WAN — уровень 3: export, план, два подтверждения.",
    durationMs: 1100,
  }),
  check_wan: spec({
    id: "check_wan",
    title: "Резервный интернет",
    normalized: "check_wan",
    risk: 0,
    tool: "check_mikrotik",
    target: "rb5009",
    runbook: "check_mikrotik",
    account: "jarvis-mikrotik",
    parameters: [{ key: "router", value: "rb5009" }, { key: "focus", value: "wan" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Посмотреть основной и резервный канал.", "Не переключать маршрут и не трогать firewall."],
    toolCall: 'check_mikrotik(router: "rb5009", focus: "wan")',
    consequences: ["Только чтение. Отказоустойчивость не перенастраивается."],
    findings: [
      { label: "ISP-A / ether1", state: "ok", detail: "Link up. До 1.1.1.1 ответ есть." },
      { label: "ISP-B / lte1", state: "bad", detail: "Интерфейс не running. Последний раз был поднят 14 часов назад." },
      { label: "Failover", state: "info", detail: "Сейчас не нужен: основной канал жив. Запасного пути нет, пока LTE лежит." },
    ],
    recommendation: "Похоже на питание или регистрацию модема, не на маршрут. Включать другой default route без подтверждения нельзя. Сначала export конфигурации.",
    durationMs: 1300,
  }),
  backup_utp: spec({
    id: "backup_utp",
    title: "Backup базы utp",
    normalized: "database_backup",
    risk: 1,
    tool: "backup_database",
    target: "sql01 / utp",
    runbook: "backup_sql_database",
    account: "jarvis-backup",
    parameters: [
      { key: "server", value: "sql01" },
      { key: "database", value: "utp" },
      { key: "destination", value: "nas-backup/sql" },
    ],
    confirmation: "none",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Сервер sql01 в allowlist, база utp привязана к нему.",
      "Проверить ONLINE, место на NAS, что backup уже не идёт.",
      "Запустить шаблон backup_sql_database, не новый скрипт.",
      "Проверить файл, размер и RESTORE VERIFYONLY.",
    ],
    toolCall: 'backup_database(server: "sql01", database: "utp")',
    consequences: ["Нагрузка на SQL на время снимка.", "Новый файл .bak на NAS.", "База не перезаписывается и не удаляется."],
    findings: [
      { label: "Доступность", state: "ok", detail: "sql01 и каталог backup отвечают." },
      { label: "База", state: "ok", detail: "utp ONLINE. Другого backup нет." },
      { label: "Место", state: "ok", detail: "На NAS свободно 2.4 ТБ." },
      { label: "Файл", state: "ok", detail: "utp_2026-10-06_14-06-22.bak" },
      { label: "Размер", state: "ok", detail: "4.82 ГБ, не пустой." },
      { label: "VERIFYONLY", state: "ok", detail: "SQL принял набор backup. Это не тестовое восстановление." },
    ],
    recommendation: "Файл на месте и прошёл VERIFYONLY. Настоящая проверка — восстановление во временную базу. Оно по расписанию раз в неделю, этой командой не делается.",
    durationMs: 12600,
  }),
  backup_mikrotik: spec({
    id: "backup_mikrotik",
    title: "Export конфигурации",
    normalized: "backup_mikrotik",
    risk: 1,
    tool: "backup_mikrotik",
    target: "rb5009",
    runbook: "backup_mikrotik",
    account: "jarvis-mikrotik",
    parameters: [{ key: "router", value: "rb5009" }],
    confirmation: "none",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Снять export и binary backup.", "Правила firewall, NAT и WireGuard не менять."],
    toolCall: 'backup_mikrotik(router: "rb5009")',
    consequences: ["Появится файл export. Маршрутизация не меняется."],
    findings: [
      { label: "Export", state: "ok", detail: "rb5009_2026-10-06.rsc сохранён в хранилище контура." },
      { label: "Изменения", state: "ok", detail: "Текущие правила не редактировались." },
    ],
    recommendation: "Копия есть. Её нужно снять ещё раз непосредственно перед любой правкой уровня 3.",
    durationMs: 1500,
  }),
  restart_1c: spec({
    id: "restart_1c",
    title: "Рестарт службы 1С",
    normalized: "restart_service",
    risk: 2,
    tool: "restart_service",
    target: "srv1c01",
    runbook: "restart_1c",
    account: "jarvis-windows",
    parameters: [
      { key: "server", value: "srv1c01" },
      { key: "service", value: "1C:Enterprise 8.3 Server Agent" },
    ],
    confirmation: "single",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Служба в allowlist. Произвольный Restart-Service из текста не собирается.",
      "Показать последствия и номер заявки.",
      "После точной фразы — шаблон restart_1c, затем проверка порта.",
    ],
    toolCall: 'restart_service(server: "srv1c01", service: "1C:Enterprise 8.3 Server Agent")',
    consequences: [
      "Сессии кластера оборвутся.",
      "Пользователи 1С на несколько минут потеряют соединение.",
      "Сейчас активных сессий: 14.",
    ],
    findings: [
      { label: "Остановка", state: "info", detail: "Шаблон остановил агент." },
      { label: "Запуск", state: "ok", detail: "Служба снова Running." },
      { label: "Порт 1540", state: "ok", detail: "Слушает." },
      { label: "Сессии", state: "info", detail: "Сразу после старта: 0. Люди заходят заново." },
    ],
    recommendation: "В этой демо-консоли служба на srv1c01 не трогалась. Отчёт — эталон шаблона после подтверждения.",
    durationMs: 8400,
  }),
  reboot_dc: spec({
    id: "reboot_dc",
    title: "Перезагрузка DC01",
    normalized: "reboot_domain_controller",
    risk: 3,
    tool: "reboot_server",
    target: "dc01",
    runbook: "check_domain_controller",
    account: "jarvis-windows",
    parameters: [{ key: "server", value: "dc01" }],
    confirmation: "double",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Это контроллер домена, DNS и DHCP.",
      "Два подтверждения одной заявки. Слово «да» не считается.",
      "Даже после них демо не шлёт reboot: хост не подключён.",
    ],
    toolCall: 'reboot_server(server: "dc01")',
    consequences: [
      "На время уйдут вход в домен, DNS и DHCP.",
      "1С и почта могут перестать резолвить имена.",
      "Активных пользователей в оценке: 14.",
    ],
    findings: [
      { label: "Заявка", state: "info", detail: "Оба этапа подтверждены в срок." },
      { label: "Исполнение", state: "warn", detail: "Reboot на dc01 не отправлялся. В контуре нет живого WinRM." },
    ],
    recommendation: "В рабочей системе здесь был бы approved runbook и окно отката, не свободная команда shutdown.",
    durationMs: 400,
  }),
  reboot_ambiguous: spec({
    id: "reboot_ambiguous",
    title: "Перезагрузка без цели",
    normalized: "reboot_unspecified",
    risk: 3,
    tool: "reboot_server",
    target: "не выбрана",
    runbook: null,
    account: "—",
    parameters: [],
    confirmation: "none",
    mutation: true,
    forceDeny: false,
    clarify: true,
    denyReason: null,
    clarifyReason: "Не выбран сервер. Перезагрузку не назначаю.",
    plan: ["Уточните хост из inventory.", "Для dc01 будет два подтверждения.", "Пока хост не назван, инструмент не выбирается."],
    toolCall: "reboot_server(server: ?)  — не сформирован",
    consequences: ["Ничего не выполнено."],
    findings: [],
    recommendation: "Назовите сервер явно, например: перезагрузи контроллер домена.",
    durationMs: 0,
  }),
  restart_ambiguous: spec({
    id: "restart_ambiguous",
    title: "Рестарт без службы",
    normalized: "restart_unspecified",
    risk: 2,
    tool: "restart_service",
    target: "не выбрана",
    runbook: null,
    account: "—",
    parameters: [],
    confirmation: "none",
    mutation: true,
    forceDeny: false,
    clarify: true,
    denyReason: null,
    clarifyReason: "Служба не из allowlist или не названа. Рестарт не назначаю.",
    plan: ["Разрешённый пример: служба агента 1С на srv1c01.", "Чужие службы из текста модели не подставляются."],
    toolCall: "restart_service(server: ?, service: ?)  — не сформирован",
    consequences: ["Ничего не выполнено."],
    findings: [],
    recommendation: "Скажите: перезапусти службу 1С.",
    durationMs: 0,
  }),
  daily_report: spec({
    id: "daily_report",
    title: "Отчёт за сегодня",
    normalized: "daily_report",
    risk: 0,
    tool: "daily_report",
    target: "площадка",
    runbook: null,
    account: "jarvis-windows",
    parameters: [{ key: "period", value: "today" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Собрать backup, диски и упавшие службы.", "Ничего не чинить в этом проходе."],
    toolCall: 'daily_report(period: "today")',
    consequences: ["Только чтение."],
    findings: [
      { label: "Backup utp", state: "ok", detail: "Ночной снимок есть, VERIFYONLY прошёл." },
      { label: "Службы Windows", state: "ok", detail: "Автозапуск без остановленных." },
      { label: "mail01", state: "warn", detail: "Диск 88%, ACME в ошибке." },
      { label: "LTE", state: "warn", detail: "Резервный канал не running." },
    ],
    recommendation: "Два хвоста на сегодня: сертификат почты и модем. Оба требуют отдельных команд, не этого отчёта.",
    durationMs: 1500,
  }),
  why_1c: spec({
    id: "why_1c",
    title: "Почему не пускает в 1С",
    normalized: "diagnose_1c_logon",
    risk: 0,
    tool: "check_1c",
    target: "srv1c01",
    runbook: "check_1c",
    account: "jarvis-windows",
    parameters: [{ key: "server", value: "srv1c01" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Сначала факты: службы, лицензии, SQL, сеть.", "Не перезапускать кластер, пока нет доказанной причины."],
    toolCall: 'check_1c(server: "srv1c01", focus: "logon")',
    consequences: ["Только чтение. Рестарт не предлагается как действие."],
    findings: [
      { label: "Службы", state: "ok", detail: "Кластер поднят." },
      { label: "Лицензии", state: "ok", detail: "Запас есть: 37 из 50." },
      { label: "SQL", state: "ok", detail: "utp ONLINE, таймаутов к 1541 нет." },
      { label: "Сеть", state: "warn", detail: "С подсети терминалов 10.2.8.0/24 до порта 1540 сегодня были отказы." },
    ],
    recommendation: "Похоже на сеть или firewall до srv1c01, не на упавший агент. Рестарт 1С это не лечит. Правило firewall само не меняю.",
    durationMs: 2200,
  }),
  coding: spec({
    id: "coding",
    title: "Правка и тесты",
    normalized: "coding_task",
    risk: 2,
    tool: "coding_agent",
    target: "company/billing",
    runbook: "git_ci_diagnostics",
    account: "jarvis-github",
    parameters: [
      { key: "repo", value: "company/billing" },
      { key: "branch", value: "fix/invoice-rounding" },
    ],
    confirmation: "single",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Читать разрешённый репозиторий.",
      "Ветка fix/invoice-rounding. В main не пушить и не мержить.",
      "Показать diff. Коммит — только после фразы подтверждения.",
      "PR и релиз этой командой не открываются.",
    ],
    toolCall: 'coding_agent(repo: "company/billing", branch: "fix/invoice-rounding")',
    consequences: ["Локальный коммит в ветке, если подтвердите.", "main, merge и release не затрагиваются."],
    findings: [
      { label: "Diff", state: "info", detail: "src/invoice/round.ts +18 / −6. Округление до копейки." },
      { label: "Тесты", state: "ok", detail: "billing.test.ts: 42 прошли." },
      { label: "Коммит", state: "ok", detail: "Создан только в ветке fix/invoice-rounding." },
      { label: "main", state: "ok", detail: "Push в main не выполнялся. Политика его запрещает." },
    ],
    recommendation: "Дальше человек смотрит diff и отдельно решает, открывать ли PR. Прямой push в main отсюда закрыт.",
    durationMs: 6400,
  }),
  git_ci: spec({
    id: "git_ci",
    title: "GitHub Actions",
    normalized: "git_ci_diagnostics",
    risk: 0,
    tool: "git_ci_diagnostics",
    target: "company/billing",
    runbook: "git_ci_diagnostics",
    account: "jarvis-github",
    parameters: [{ key: "repo", value: "company/billing" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Прочитать последний workflow run.", "Не перезапускать и не пушить."],
    toolCall: 'git_ci_diagnostics(repo: "company/billing")',
    consequences: ["Только чтение."],
    findings: [
      { label: "Workflow", state: "bad", detail: "CI run 1842, ветка fix/invoice-rounding." },
      { label: "Job test", state: "bad", detail: "round: ожидали 1.20, получили 1.25." },
      { label: "main", state: "ok", detail: "Защищён. Этот разбор ничего не запушил." },
    ],
    recommendation: "Падение в округлении счёта. Чинить можно отдельной командой на агента. В main само не уедет.",
    durationMs: 980,
  }),
  rollback_project: spec({
    id: "rollback_project",
    title: "Откат billing",
    normalized: "rollback_project",
    risk: 2,
    tool: "rollback_project",
    target: "company/billing",
    runbook: "rollback_project",
    account: "jarvis-github",
    parameters: [
      { key: "repo", value: "company/billing" },
      { key: "to", value: "предыдущий релиз" },
    ],
    confirmation: "single",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Показать, какой релиз станет текущим.", "Дождаться точной фразы.", "Не откатывать, пока это только демо."],
    toolCall: 'rollback_project(repo: "company/billing", to: "previous")',
    consequences: ["Пользователи billing увидят предыдущую версию.", "Текущий релиз останется для возврата."],
    findings: [
      { label: "План отката", state: "info", detail: "Текущий v1.8.3 → предыдущий v1.8.2." },
      { label: "Исполнение", state: "warn", detail: "Выкладка не менялась: цель не подключена." },
    ],
    recommendation: "Подтверждение здесь проверяет дисциплину, а не катит реальный откат.",
    durationMs: 500,
  }),
  clean_server: spec({
    id: "clean_server",
    title: "Неоднозначно: почистить",
    normalized: "ambiguous_cleanup",
    risk: 0,
    tool: "check_disk",
    target: "не выбрана для удаления",
    runbook: "check_disk",
    account: "jarvis-linux",
    parameters: [{ key: "scope", value: "report-only" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Фраза не задаёт, что удалять.",
      "Не превращать её в очистку диска, docker prune или rm.",
      "Снять только отчёт: место, журналы, размер docker.",
    ],
    toolCall: 'check_disk(scope: "report-only")',
    consequences: ["Файлы не удаляются. Команда shell не собирается."],
    findings: [
      { label: "mail01 /", state: "warn", detail: "Свободно 12%. Крупное: журналы почты и docker root." },
      { label: "Остальные", state: "ok", detail: "Ниже порога внимания." },
      { label: "Удаление", state: "info", detail: "Не предложено и не поставлено в очередь." },
    ],
    recommendation: "Если нужна уборка, назовите объект: журналы старше 30 дней на mail01. Это будет уровень 2 с подтверждением, не эта команда.",
    durationMs: 1600,
  }),
  push_main: spec({
    id: "push_main",
    title: "Push в main",
    normalized: "push_main",
    risk: 3,
    tool: "git_push",
    target: "main",
    runbook: null,
    account: "jarvis-github",
    parameters: [{ key: "branch", value: "main" }],
    confirmation: "none",
    mutation: true,
    forceDeny: true,
    clarify: false,
    denyReason: "Прямой push в main или master запрещён. Подтверждение это не открывает.",
    clarifyReason: null,
    plan: ["Отклонить до вызова git.", "Рабочий путь: ветка, тесты, diff, approval, PR."],
    toolCall: 'git_push(branch: "main")  — заблокирован',
    consequences: ["Репозиторий не изменён."],
    findings: [],
    recommendation: "Попросите правку в ветке. PR открывает человек или отдельное разрешение, не эта фраза.",
    durationMs: 0,
  }),
  delete_db: spec({
    id: "delete_db",
    title: "Удаление базы",
    normalized: "drop_database",
    risk: 3,
    tool: "drop_database",
    target: "sql01 / utp",
    runbook: null,
    account: "—",
    parameters: [{ key: "database", value: "utp" }],
    confirmation: "none",
    mutation: true,
    forceDeny: true,
    clarify: false,
    denyReason: "Удаления базы нет в схеме инструментов. Общий shell запрещён, approval не создаётся.",
    clarifyReason: null,
    plan: ["Не выбирать DROP DATABASE.", "Не спрашивать подтверждение на запрещённое действие."],
    toolCall: "drop_database(...)  — нет такого инструмента",
    consequences: ["База не изменена."],
    findings: [],
    recommendation: "Доступны проверка и backup. Восстановление — отдельный runbook уровня 3, не удаление.",
    durationMs: 0,
  }),
  read_1c_code: spec({
    id: "read_1c_code",
    title: "Модуль расширения",
    normalized: "read_1c_code",
    risk: 0,
    tool: "read_1c_module",
    target: "расширение utp / Документ.Реализация",
    runbook: "read_1c_code",
    account: "jarvis-1c-reader",
    parameters: [
      { key: "module", value: "МодульОбъекта" },
      { key: "procedure", value: "ОбработкаПроведения" },
    ],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Читать только расширение, не основную конфигурацию на запись.", "Не выполнять модуль и не открывать отладчик на рабочей базе."],
    toolCall: 'read_1c_module(object: "Документ.Реализация", module: "МодульОбъекта")',
    consequences: ["Только чтение."],
    findings: [
      { label: "Модуль", state: "info", detail: "РасширениеУТ, МодульОбъекта, процедура ОбработкаПроведения, 86 строк." },
      { label: "Запрос", state: "warn", detail: "РегистрНакопления.Продажи.Остатки без параметра периода." },
      { label: "Проведение", state: "ok", detail: "Движения пишутся после проверки заполнения. Пустых наборов нет." },
      { label: "База", state: "ok", detail: "Текст прочитан из git расширения. В информационную базу ничего не загружалось." },
    ],
    recommendation: "Слабое место — виртуальная таблица без периода. Правку можно положить в ветку расширения, не в рабочую базу.",
    durationMs: 900,
  }),
  review_1c_query: spec({
    id: "review_1c_query",
    title: "Разбор запроса",
    normalized: "review_1c_query",
    risk: 0,
    tool: "review_1c_query",
    target: "расширение utp / запрос остатков",
    runbook: "review_1c_query",
    account: "jarvis-1c-reader",
    parameters: [{ key: "source", value: "МодульОбъекта" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Разобрать текст запроса.", "Не выполнять его на копии боя и не снимать план СУБД отсюда."],
    toolCall: 'review_1c_query(module: "МодульОбъекта")',
    consequences: ["Запрос не запускался."],
    findings: [
      { label: "Виртуальная таблица", state: "warn", detail: "Остатки() без &Период. Платформа берёт текущие остатки на сейчас." },
      { label: "Соединение", state: "warn", detail: "Левое соединение номенклатуры без отбора по организации. Строк больше, чем нужно проведению." },
      { label: "Индекс", state: "info", detail: "Условие по регистратору в тексте нет. Для проведения документа он обычно не нужен, для отчёта нужен." },
      { label: "Выполнение", state: "ok", detail: "Запрос не передавался в кластер." },
    ],
    recommendation: "Добавьте параметр периода и отбор по организации. Это правка расширения, не обновление конфигурации базы.",
    durationMs: 700,
  }),
  trace_1c: spec({
    id: "trace_1c",
    title: "Стек 1С",
    normalized: "trace_1c",
    risk: 0,
    tool: "read_1c_event_log",
    target: "srv1c01 / журнал регистрации",
    runbook: "read_1c_code",
    account: "jarvis-1c-reader",
    parameters: [{ key: "event", value: "проведение" }],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Прочитать последние ошибки проведения.", "Не исправлять данные документа и не перепроводить."],
    toolCall: 'read_1c_event_log(server: "srv1c01", event: "posting")',
    consequences: ["Журнал только читается."],
    findings: [
      { label: "Событие", state: "bad", detail: "Ошибка проведения Реализация 00001482 сегодня в 13:41." },
      { label: "Стек", state: "info", detail: "ОбщийМодуль.ПроведениеСервер.Провести, строка 214." },
      { label: "Причина", state: "warn", detail: "Поле СтавкаНДС не найдено в выборке запроса. В расширении колонка называется Ставка." },
      { label: "Данные", state: "ok", detail: "Документ не перепроводился. Движения не переписывались." },
    ],
    recommendation: "Расхождение имён колонки. Чиню только текстом расширения после отдельной команды, документы сам не трогаю.",
    durationMs: 800,
  }),
  patch_1c: spec({
    id: "patch_1c",
    title: "Правка расширения",
    normalized: "patch_1c",
    risk: 2,
    tool: "patch_1c_extension",
    target: "расширение utp / ветка fix/posting-query",
    runbook: "patch_1c_extension",
    account: "jarvis-1c-reader",
    parameters: [
      { key: "branch", value: "fix/posting-query" },
      { key: "module", value: "МодульОбъекта" },
    ],
    confirmation: "single",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Править файл расширения в ветке, не основную конфигурацию.",
      "Показать diff. В рабочую базу не загружать.",
      "Обновление конфигурации базы и CF этой командой закрыты.",
    ],
    toolCall: 'patch_1c_extension(branch: "fix/posting-query", module: "МодульОбъекта")',
    consequences: ["Появится diff в ветке расширения.", "Информационная база utp не обновляется.", "Пользователи проведение не теряют."],
    findings: [
      { label: "Diff", state: "info", detail: "Остатки(&Период) и отбор по организации. Колонка СтавкаНДС возвращена в выборку." },
      { label: "Синтаксис", state: "ok", detail: "Проверка модуля расширения без ошибок. Это не запуск на кластере." },
      { label: "База", state: "ok", detail: "CF не собирался. ОбновитьКонфигурациюБазыДанных не вызывалось." },
    ],
    recommendation: "Дальше человек смотрит diff и сам решает, загружать ли расширение. Отсюда в рабочую базу хода нет.",
    durationMs: 2400,
  }),
  provision_1c_admin: spec({
    id: "provision_1c_admin",
    title: "Заявка на jarvis-1c-admin",
    normalized: "provision_1c_admin",
    risk: 3,
    tool: "request_account",
    target: "каталог учёток",
    runbook: null,
    account: "jarvis-1c-reader",
    parameters: [{ key: "account", value: "jarvis-1c-admin" }],
    confirmation: "double",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: [
      "Открыть заявку на отдельную учётку. jarvis-1c-reader не расширять.",
      "В заявке только тестовая база: загрузка расширения и обновление её конфигурации.",
      "Production, Выполнить() и произвольный COM в текст заявки не входят.",
    ],
    toolCall: 'request_account(name: "jarvis-1c-admin", scope: "test-infobase")',
    consequences: [
      "Появится номер заявки. Учётки в каталоге ещё нет.",
      "Две точные фразы. «Да» не принимается.",
      "Даже после них консоль не создаёт учётку и не пишет в production.",
    ],
    findings: [
      { label: "Заявка", state: "ok", detail: "Номер записан в журнал. Это разрешение на бумаге, не учётка." },
      { label: "Каталог", state: "warn", detail: "jarvis-1c-admin не создана. Пароль нигде не задавался." },
      { label: "Граница", state: "ok", detail: "Тестовая база ещё не подключена. Production, CF, Выполнить() и COM не запрашивались." },
    ],
    recommendation: "Учётку заводит человек в тестовом контуре. Пароль в эту консоль не приносить.",
    durationMs: 400,
  }),
  load_1c_cf: spec({
    id: "load_1c_cf",
    title: "Загрузка конфигурации",
    normalized: "load_1c_cf",
    risk: 3,
    tool: "load_configuration",
    target: "рабочая база utp",
    runbook: null,
    account: "—",
    parameters: [{ key: "file", value: "cf" }],
    confirmation: "none",
    mutation: true,
    forceDeny: true,
    clarify: false,
    denyReason: "У jarvis-1c-reader нет загрузки CF, обновления конфигурации БД, Выполнить(), произвольного COM и записи в production.",
    clarifyReason: null,
    plan: ["Не открывать конфигуратор на запись.", "Не вызывать ОбновитьКонфигурациюБазыДанных.", "Не исполнять текст, который пришёл в команде."],
    toolCall: "load_configuration(...)  — нет такого инструмента",
    consequences: ["Рабочая база не изменена."],
    findings: [],
    recommendation: "Правка возможна только как diff расширения. В базу её кладёт человек после ревью.",
    durationMs: 0,
  }),
  onec_dev: spec({
    id: "onec_dev",
    title: "Разработка 1С",
    normalized: "onec_dev",
    risk: 2,
    tool: "onec_repository",
    target: "расширение, контур test",
    runbook: null,
    account: "jarvis-1c-dev",
    parameters: [{ key: "environment", value: "test" }],
    confirmation: "single",
    mutation: true,
    forceDeny: false,
    clarify: false,
    denyReason: null,
    clarifyReason: null,
    plan: ["Править только копию расширения."],
    toolCall: "onec_repository(...)",
    consequences: ["Production не вызывается."],
    findings: [],
    recommendation: null,
    durationMs: 400,
  }),
  unknown: spec({
    id: "unknown",
    title: "Команда не разобрана",
    normalized: "unknown",
    risk: 0,
    tool: "none",
    target: "—",
    runbook: null,
    account: "—",
    parameters: [],
    confirmation: "none",
    mutation: false,
    forceDeny: false,
    clarify: true,
    denyReason: null,
    clarifyReason: "Не вижу безопасного намерения. Опасное действие угадывать не буду.",
    plan: ["Ничего не выполнять.", "Попросить другую формулировку из известных сценариев."],
    toolCall: "—",
    consequences: ["Ничего не выполнено."],
    findings: [],
    recommendation: "Например: проверь сервер, посмотри модуль проведения, проверь запрос 1С.",
    durationMs: 0,
  }),
};

export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/^джарвис[, ]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchIntent(raw: string): IntentId {
  const s = normalize(raw);
  if (!s) return "unknown";
  if (/удал\S*\s+баз(а|у|ы|е|ой)?(\s|$)|снеси\s+баз(у|ы)?(\s|$)|drop\s+database|delete\s+database/.test(s)) return "delete_db";
  if (/(пуш\S*|push).{0,48}(main|master)|(main|master).{0,24}(пуш|push)/.test(s)) return "push_main";
  if (/почист|очисти сервер|clean up|cleanup/.test(s)) return "clean_server";
  if (/проверь/.test(s) && /(баз|utp|ютп|sql)/.test(s) && !/(backup|бэкап|бекап|копи)/.test(s)) return "check_sql";
  if (/(backup|бэкап|бекап|резерв\S*\s+копи\S*).{0,40}(utp|ютп)|(utp|ютп).{0,40}(backup|бэкап|бекап|копи)/.test(s)) {
    return "backup_utp";
  }
  if (/(бэкап|backup|export|сохрани\S*).{0,32}(mikrotik|микротик|rb5009)|(mikrotik|микротик|rb5009).{0,32}(бэкап|backup|export|конфиг)/.test(s)) {
    return "backup_mikrotik";
  }
  if (/mailcow|мейлкау|почтов\S* сервер|почт/.test(s)) return "check_mailcow";
  if (/wireguard|вайргард|вайр гард/.test(s)) return "check_wireguard";
  if (/jarvis-1c-admin/.test(s)) return "provision_1c_admin";
  if (/github|actions|пайплайн/.test(s)) return "git_ci";
  if (/загруз\S*\s+(cf|конфигурац)|обнов\S*\s+конфигурац|залей\s+cf|выполнить\s*\(|динамическ\S*\s+выполн|произвольн\S*\s+com|com-?\s*объект|измен\S*\s+(production|рабоч\S*\s+баз)|запис\S*\s+в\s+(базу|production)/.test(s)) return "load_1c_cf";
  if (/(запрос)/.test(s) && /(проверь|разбер|почему|тормоз|план|посмотр|глянь)/.test(s)) return "review_1c_query";
  if (/журнал\s+регистрац|стек|строк\S*\s+модул/.test(s)) return "trace_1c";
  if (/(исправ|поправ|доработ|патч)/.test(s) && /(модул|запрос|расширен|обработк|1с|1c)/.test(s)) return "patch_1c";
  if (/(модул|расширен|метаданн|обработк|процедур|функци)/.test(s) && /(посмотр|прочита|разбер|найд|глянь|покаж)/.test(s)) return "read_1c_code";
  if (/исправ\S* ошиб|прогони тест|почини код/.test(s)) return "coding";
  if (/перезагруз|reboot|ребут/.test(s)) {
    return /dc01|контроллер|домен/.test(s) ? "reboot_dc" : "reboot_ambiguous";
  }
  if (/перезапуст/.test(s)) {
    return /1с|1c|агент/.test(s) ? "restart_1c" : "restart_ambiguous";
  }
  if (/откат|rollback/.test(s)) return "rollback_project";
  if (/резерв\S* интернет|второй канал|запасн\S* канал|не работает интернет/.test(s)) return "check_wan";
  if (/не заходят|не пускает|не могут войти|почему.{0,24}1с|почему.{0,24}1c/.test(s)) return "why_1c";
  if (/свобод\S* мест|место на диск|на всех сервер/.test(s)) return "check_disk";
  if (/отчет|сводк/.test(s)) return "daily_report";
  if (/docker|докер/.test(s)) return "check_docker";
  if (/(проверь|состоян|статус).{0,24}(1с|1c)|(1с|1c).{0,16}(сервер|кластер)/.test(s)) return "check_1c";
  if (/контроллер|dc01|(^|\s)dc(\s|$)/.test(s)) return "check_dc";
  if (/mikrotik|микротик|rb5009|маршрутизатор/.test(s)) return "check_mikrotik";
  if (/проверь сервер|состояние площад|статус площад|статус сервер/.test(s)) return "check_fleet";
  return "unknown";
}

function inMaintenance(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 22 || hour < 6;
}

function confirmText(kind: Spec["confirmation"]): string {
  if (kind === "double") return "два этапа";
  if (kind === "single") return "одна фраза с номером";
  return "не требуется";
}

type CompoundHit = {
  spec: Spec;
  previewFindings: boolean;
  note: string | null;
  extraNotes: string[];
};

function matchClause(chunk: string): IntentId {
  const direct = matchIntent(chunk);
  if (direct !== "unknown") return direct;
  const s = normalize(chunk);
  if (/(бэкап|backup|копи)/.test(s) && /(utp|ютп|баз)/.test(s)) return "backup_utp";
  if (/(бэкап|backup|копи|конфиг|export)/.test(s) && /(mikrotik|микротик|rb5009)/.test(s)) return "backup_mikrotik";
  if (/mailcow|почт/.test(s)) return "check_mailcow";
  if (/диск|место/.test(s)) return "check_disk";
  if (/docker|докер/.test(s)) return "check_docker";
  if (/wireguard|вайр/.test(s)) return "check_wireguard";
  if (/mikrotik|микротик|маршрутизатор/.test(s)) return "check_mikrotik";
  if (/запрос/.test(s)) return "review_1c_query";
  if (/модул|расширен|метаданн|обработк/.test(s)) return "read_1c_code";
  if (/журнал/.test(s)) return "trace_1c";
  if (/1с|1c/.test(s)) return "check_1c";
  if (/(^|\s)sql(\s|$)|utp|ютп|база|базу|базы/.test(s)) return "check_sql";
  if (/площад|сервер/.test(s)) return "check_fleet";
  if (/контроллер|домен|dc01|(^|\s)dc(\s|$)/.test(s)) return "check_dc";
  if (/интернет|канал/.test(s)) return "check_wan";
  if (/отчет|сводк/.test(s)) return "daily_report";
  if (/github|actions|пайплайн/.test(s)) return "git_ci";
  return "unknown";
}

function compoundSpec(raw: string): CompoundHit | null {
  let body = normalize(raw);
  if (!body) return null;
  const extraNotes: string[] = [];
  const avoid = new Set<IntentId>();
  let readOnly = false;
  const guards: { re: RegExp; note: string; readOnly?: boolean; drop: IntentId[] }[] = [
    {
      re: /только\s+(?:скажи|сообщи|покажи|посмотри)|только\s+чтение|ничего\s+не\s+мен\S*|без\s+изменений/g,
      note: "Ограничение: только чтение, изменения в план не ставятся.",
      readOnly: true,
      drop: [],
    },
    {
      re: /не\s+(?:перезапуск\S*|перезагруж\S*|ребут\S*|рестарт\S*)/g,
      note: "Перезапуск и перезагрузка из фразы исключены.",
      drop: ["restart_1c", "reboot_dc", "reboot_ambiguous", "restart_ambiguous"],
    },
    {
      re: /не\s+(?:пуш\S*|push\S*)(?:\s+\S+){0,4}/g,
      note: "Push из фразы исключён.",
      drop: ["push_main"],
    },
    {
      re: /не\s+удал\S*(?:\s+\S+){0,3}/g,
      note: "Удаление из фразы исключено.",
      drop: ["delete_db"],
    },
    {
      re: /не\s+чист\S*/g,
      note: "Очистка из фразы исключена.",
      drop: ["clean_server"],
    },
    {
      re: /не\s+(?:загруж\S*|обнов\S*\s+конфигурац\S*)(?:\s+\S+){0,5}/g,
      note: "Загрузка в рабочую базу из фразы исключена.",
      drop: ["load_1c_cf"],
    },
  ];
  for (const guard of guards) {
    if (!guard.re.test(body)) continue;
    guard.re.lastIndex = 0;
    extraNotes.push(guard.note);
    if (guard.readOnly) readOnly = true;
    for (const id of guard.drop) avoid.add(id);
    body = body.replace(guard.re, " ");
    guard.re.lastIndex = 0;
  }
  const conditionMatch = body.match(/если\s+[^,;]+/);
  const condition = conditionMatch?.[0] ?? null;
  if (condition) {
    extraNotes.push(`Условие «${condition}» не включает само действие.`);
    body = body.replace(condition, " ");
  }
  const chunks = body
    .split(/\s*(?:,|;| и | потом | затем | а затем | после этого | а также )\s*/)
    .map((part) => part.replace(/^(а|ну|потом|затем|сначала|также|еще|ещё)\s+/, "").trim())
    .filter((part) => part.length > 1 && !/^(пожалуйста|сейчас|мне|там)$/.test(part));
  const known: IntentId[] = [];
  const missed: string[] = [];
  const seen = new Set<IntentId>();
  for (const chunk of chunks) {
    const intent = matchClause(chunk);
    if (intent === "unknown") {
      if (!/^(проверь|посмотри|скажи|статус|что)$/.test(chunk)) missed.push(chunk);
      continue;
    }
    if (seen.has(intent)) continue;
    seen.add(intent);
    known.push(intent);
    if (known.length === 4) break;
  }
  const complex = known.length >= 2 || extraNotes.length > 0 || missed.length > 0;
  if (!complex) return null;

  const dropped: { id: IntentId; why: string }[] = [];
  const held: IntentId[] = [];
  const sure: IntentId[] = [];
  for (const id of known) {
    const spec = SPECS[id];
    if (spec.forceDeny) {
      dropped.push({ id, why: spec.denyReason ?? "Запрещено политикой." });
      continue;
    }
    if (avoid.has(id)) {
      dropped.push({ id, why: "Вы просили этого не делать." });
      continue;
    }
    if (readOnly && spec.mutation) {
      dropped.push({ id, why: "Фраза разрешает только чтение." });
      continue;
    }
    if (spec.clarify) {
      held.push(id);
      continue;
    }
    sure.push(id);
  }

  const dropLines = dropped.map((item) => `Не делаю «${SPECS[item.id].title}»: ${item.why}`);
  const heldLines = held.map((id) => `Не назначаю «${SPECS[id].title}»: ${SPECS[id].clarifyReason ?? "нужно уточнение"}`);
  const missLine = missed.length > 0 ? `Не разобрал: ${missed.join("; ")}.` : null;
  const note = [...dropLines, ...heldLines, missLine].filter(Boolean).join(" ") || null;

  if (sure.length === 0 && held.length === 0 && known.length > 0 && known.every((id) => SPECS[id].forceDeny)) {
    const reason = known.map((id) => SPECS[id].denyReason).filter(Boolean).join(" ");
    return {
      spec: {
        ...SPECS[known[0]],
        id: "unknown",
        title: "План отклонён",
        normalized: "compound_plan",
        forceDeny: true,
        denyReason: reason,
        plan: dropLines,
        toolCall: known.map((id) => SPECS[id].toolCall).join(" → "),
        recommendation: "Ни один шаг этого плана не входит в схему инструментов.",
      },
      previewFindings: false,
      note: reason,
      extraNotes,
    };
  }

  if (sure.length === 0) {
    const reason = note ?? "В фразе не осталось безопасного шага.";
    return {
      spec: {
        ...SPECS.unknown,
        id: "unknown",
        title: "План не собран",
        normalized: "compound_plan",
        clarify: true,
        clarifyReason: reason,
        plan: [...extraNotes, ...dropLines, ...heldLines, "Ничего не выполнять, пока нет ясного безопасного шага."],
        recommendation: "Оставьте чтение или назовите один разрешённый runbook.",
      },
      previewFindings: false,
      note: reason,
      extraNotes,
    };
  }

  if (sure.length === 1) {
    const base = SPECS[sure[0]];
    return {
      spec: {
        ...base,
        plan: [...base.plan, ...extraNotes, ...dropLines, ...heldLines],
        recommendation: [base.recommendation, note].filter(Boolean).join(" "),
      },
      previewFindings: false,
      note,
      extraNotes,
    };
  }

  const specs = sure.map((id) => SPECS[id]);
  const risk = specs.reduce<Risk>((max, item) => (item.risk > max ? item.risk : max), 0);
  const confirmation = specs.reduce<Spec["confirmation"]>((kind, item) => {
    const rank = item.confirmation === "double" ? 2 : item.confirmation === "single" ? 1 : 0;
    const current = kind === "double" ? 2 : kind === "single" ? 1 : 0;
    if (rank > current) return item.confirmation;
    return kind;
  }, "none");
  const findings = specs
    .filter((item) => !item.mutation)
    .flatMap((item) => item.findings.map((finding) => ({ ...finding, label: `${item.title}: ${finding.label}` })));
  const accounts = [...new Set(specs.map((item) => item.account))];
  return {
    spec: {
      id: sure[0],
      title: `План из ${specs.length} шагов`,
      normalized: "compound_plan",
      risk,
      tool: "plan",
      target: specs.map((item) => item.target).join(", "),
      runbook: null,
      account: accounts.join(", "),
      parameters: specs.map((item, index) => ({ key: String(index + 1), value: item.tool })),
      confirmation,
      mutation: specs.some((item) => item.mutation),
      forceDeny: false,
      clarify: false,
      denyReason: null,
      clarifyReason: null,
      plan: [
        ...extraNotes,
        ...specs.map((item, index) => `${index + 1}. ${item.title}. ${item.plan[0] ?? item.tool}`),
        ...dropLines,
        ...heldLines,
      ],
      toolCall: specs.map((item) => item.toolCall).join(" → "),
      consequences: specs.filter((item) => item.mutation).flatMap((item) => item.consequences),
      findings,
      recommendation: [
        "Шаги идут по порядку. Запрещённый шаг не становится разрешённым от соседнего.",
        note,
      ]
        .filter(Boolean)
        .join(" "),
      durationMs: specs.reduce((sum, item) => sum + item.durationMs, 0),
    },
    previewFindings: findings.length > 0 && specs.some((item) => item.mutation),
    note,
    extraNotes,
  };
}

function specFromDev(plan: DevPlan): Spec {
  const allowed = plan.steps.filter((item) => !item.deny);
  const denied = plan.steps.filter((item) => item.deny);
  const allDenied = allowed.length === 0;
  const risk = plan.steps.reduce<Risk>((max, item) => (item.risk > max ? item.risk : max), 0);
  const confirmation = allDenied
    ? "none"
    : allowed.some((item) => item.confirmation === "single")
      ? "single"
      : "none";
  const titles = (allDenied ? denied : allowed).map((item) => item.title);
  return spec({
    id: "onec_dev",
    title: titles.length === 1 ? titles[0] : "Разработка 1С",
    normalized: "onec_dev",
    risk,
    tool: "onec_repository",
    target: `расширение, контур ${plan.environment}`,
    runbook: null,
    account: "jarvis-1c-dev",
    parameters: [
      { key: "environment", value: plan.environment },
      { key: "capabilities", value: plan.steps.map((item) => item.capability).join(", ") },
    ],
    confirmation,
    mutation: allowed.some((item) => item.mutation),
    forceDeny: allDenied,
    clarify: false,
    denyReason: allDenied ? denied.map((item) => item.reason).join(" ") : null,
    clarifyReason: null,
    plan: [
      `Контур ${plan.environment}. Учётка jarvis-1c-dev, не постоянный admin.`,
      ...allowed.map((item) =>
        item.capability === "extension.create"
          ? "Расширение JarvisDev уже собрано в extensions/JarvisDev. Это выгрузка в файлы, не загрузка в базу."
          : `${item.title}: копия расширения, не основная конфигурация.`,
      ),
      ...denied.map((item) => `Не делаю «${item.title}»: ${item.reason}`),
      onecDevAdapter.note,
    ],
    toolCall: `onec_repository(environment: "${plan.environment}", capabilities: "${plan.steps.map((item) => item.capability).join(", ")}")`,
    consequences: allDenied
      ? ["Ничего не изменено."]
      : [
          "Правка только в копии расширения выбранного контура.",
          "Commit и PR ждут точную фразу. Push в main по-прежнему закрыт.",
          "CF, конфигурация production и SQL-таблицы не вызываются.",
        ],
    findings: allDenied
      ? []
      : [
          { label: "Контур", state: "info", detail: plan.environment },
          { label: "Адаптер", state: "warn", detail: onecDevAdapter.note },
          ...allowed.map((item) => ({ label: item.title, state: "ok" as const, detail: "Шаг принят политикой разработчика." })),
        ],
    recommendation: allDenied
      ? "Повторите то же действие для development или test и только через расширение."
      : "Дальше человек смотрит diff. В рабочую базу это само не попадает.",
    durationMs: 600,
  });
}

export function evaluate(raw: string, operator: Operator, now: Date): Decision {
  const dev = classifyOnecDeveloper(raw);
  const compound = dev ? null : compoundSpec(raw);
  const specItem = dev ? specFromDev(dev) : compound?.spec ?? SPECS[matchIntent(raw)];
  const windowOpen = inMaintenance(now);
  const notes = [
    `Пользователь: ${operator.name}`,
    `Telegram ID: ${operator.allowed ? String(operator.telegramId) : "нет в allowlist"}`,
    `Действие: ${specItem.tool}`,
    `Цель: ${specItem.target}`,
    `Риск: L${specItem.risk} ${RISK_LABEL[specItem.risk]}`,
    `Схема инструмента: ${specItem.forceDeny ? "нет" : "да"}`,
    `Подтверждение: ${confirmText(specItem.confirmation)}`,
    windowOpen
      ? "Окно 22:00–06:00: сейчас внутри. Для изменений фраза всё равно нужна."
      : specItem.risk >= 2
        ? "Окно 22:00–06:00: сейчас вне окна. Для изменения нужно подтверждение."
        : "Окно обслуживания чтение и низкий риск не блокирует.",
    `Учётка: ${specItem.account}`,
    ...(compound?.extraNotes ?? []),
  ];

  let verdict: Verdict = "allow";
  let reason: string | null = null;
  if (!operator.allowed) {
    verdict = "deny";
    reason = "Этот Telegram ID не в allowlist. Имя аккаунта не проверяется.";
  } else if (specItem.forceDeny) {
    verdict = "deny";
    reason = specItem.denyReason;
  } else if (specItem.clarify) {
    verdict = "clarify";
    reason = specItem.clarifyReason;
  } else if (dev && dev.steps.some((item) => item.deny) && dev.steps.some((item) => !item.deny)) {
    reason = dev.steps
      .filter((item) => item.deny)
      .map((item) => item.reason)
      .join(" ");
  } else if (compound?.note) {
    reason = compound.note;
  }

  return { ...specItem, verdict, reason, policyNotes: notes, previewFindings: compound?.previewFindings ?? false };
}

export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(ts);
}

export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Quick-action chips. Outside mock mode only read-only checks are offered. */
export function visibleSuggestions(serverMode: string): typeof SUGGESTIONS {
  return serverMode === "mock" ? SUGGESTIONS : SUGGESTIONS.filter((item) => item.readOnly);
}

/** Header label: DEMO only for mock mode or the demo profile, never a bare DEMO in real mode. */
export function modeLabel(serverMode: string, profile: string): string {
  if (serverMode === "mock") return "DEMO · mock";
  const mode = serverMode === "real" ? "REAL" : "DRY RUN";
  return profile === "production-infra" ? `${mode} · production` : `${mode} · профиль demo`;
}

/** Honest note for the Servers panel. */
export function inventoryNote(serverMode: string, adapters: Record<string, string> | null): string {
  if (serverMode === "mock") return "Не в коде агента, а в inventory. Демо-набор.";
  const hostAdapters = ["ssh", "powershell"].map((key) => adapters?.[key] ?? "NOT_CONFIGURED");
  if (hostAdapters.every((state) => state === "NOT_CONFIGURED" || state === "CREDENTIAL_UNAVAILABLE")) {
    return "Инвентарь: шаблон, серверы не подключены (SSH/WinRM не настроены). Живые данные сейчас только с роутера.";
  }
  return "Инвентарь из config/jarvis/inventory.json; статус подключения — в /ready.";
}
