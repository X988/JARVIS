import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as ScrollText, c as KeyRound, i as Server, l as ArrowUp, o as Mic, r as Square, s as MessageSquare, t as X } from "../_libs/lucide-react.mjs";
import { t as create } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DgJAtvGE.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var RISK_LABEL = {
	0: "чтение",
	1: "низкий",
	2: "изменение",
	3: "критический"
};
var OPERATORS = [{
	id: "admin1",
	name: "admin1",
	telegramId: 100842,
	allowed: true
}, {
	id: "stranger",
	name: "чужой аккаунт",
	telegramId: 0,
	allowed: false
}];
var SUGGESTIONS = [
	{
		label: "Проверь сервер",
		text: "Проверь сервер"
	},
	{
		label: "Backup utp",
		text: "Сделай резервную копию базы utp"
	},
	{
		label: "Mailcow",
		text: "Проверь Mailcow"
	},
	{
		label: "Место",
		text: "Проверь свободное место на всех серверах"
	},
	{
		label: "Служба 1С",
		text: "Перезапусти службу 1С"
	},
	{
		label: "Ребут DC",
		text: "Перезагрузи контроллер домена"
	},
	{
		label: "Почисти сервер",
		text: "Почисти сервер"
	},
	{
		label: "Push в main",
		text: "Запушь исправление в main"
	},
	{
		label: "Удали базу",
		text: "Удали базу utp"
	},
	{
		label: "1С не пускает",
		text: "Почему пользователи не заходят в 1С"
	}
];
var VOICE_PRESETS = [
	{
		id: "fleet",
		text: "Джарвис, проверь сервер",
		length: "0:02"
	},
	{
		id: "backup",
		text: "Джарвис, сделай резервную копию базы utp",
		length: "0:04"
	},
	{
		id: "mail",
		text: "Проверь Mailcow",
		length: "0:02"
	},
	{
		id: "wan",
		text: "Почему не работает резервный интернет",
		length: "0:03"
	},
	{
		id: "restart",
		text: "Перезапусти службу 1С",
		length: "0:02"
	}
];
var SERVERS = [
	{
		id: "dc01",
		type: "Windows",
		roles: [
			"domain controller",
			"DNS",
			"DHCP"
		],
		note: "запись отдельно от изменений"
	},
	{
		id: "srv1c01",
		type: "Windows",
		roles: ["1С"],
		note: "кластер, порты 1540–1541"
	},
	{
		id: "sql01",
		type: "Windows",
		roles: ["SQL Server"],
		note: "база utp, учётка jarvis-sql"
	},
	{
		id: "fs01",
		type: "Windows",
		roles: ["файлы", "SMB"],
		note: "общие каталоги"
	},
	{
		id: "mail01",
		type: "Linux",
		roles: ["Mailcow"],
		note: "docker compose"
	},
	{
		id: "rb5009",
		type: "MikroTik",
		roles: ["шлюз", "WireGuard"],
		note: "API-SSL, не SSH по умолчанию"
	}
];
var RUNBOOKS = [
	{
		id: "check_windows_server",
		title: "Проверка Windows",
		description: "Службы, диск, CPU, RAM, сеть. Без изменений.",
		inputs: "server",
		validation: "хост есть в inventory",
		risk: 0,
		targets: "dc01, srv1c01, sql01, fs01",
		executor: "semaphore / WinRM",
		timeout: "60 с",
		rollback: "не нужен",
		verification: "ответы служб и счётчиков"
	},
	{
		id: "check_domain_controller",
		title: "Проверка DC",
		description: "Репликация, DNS, DHCP, Netlogon. Без Domain Admin.",
		inputs: "server",
		validation: "роль domain_controller",
		risk: 0,
		targets: "dc01",
		executor: "jarvis-windows, read",
		timeout: "90 с",
		rollback: "не нужен",
		verification: "repadmin и службы AD"
	},
	{
		id: "check_1c",
		title: "Проверка 1С",
		description: "ragent, rmngr, ras, лицензии, сессии, связь с SQL.",
		inputs: "server",
		validation: "роль 1c",
		risk: 0,
		targets: "srv1c01",
		executor: "semaphore",
		timeout: "90 с",
		rollback: "не нужен",
		verification: "службы running, порт слушает"
	},
	{
		id: "check_sql_database",
		title: "Проверка базы",
		description: "ONLINE, размер, последний backup, активные сессии.",
		inputs: "server, database",
		validation: "база в allowlist",
		risk: 0,
		targets: "sql01",
		executor: "jarvis-sql",
		timeout: "45 с",
		rollback: "не нужен",
		verification: "state_desc = ONLINE"
	},
	{
		id: "check_linux_server",
		title: "Проверка Linux",
		description: "systemctl, диск, память, firewall. Ansible вместо сырого shell.",
		inputs: "server",
		validation: "тип linux",
		risk: 0,
		targets: "mail01",
		executor: "ansible / jarvis-linux",
		timeout: "60 с",
		rollback: "не нужен",
		verification: "модули ansible без failed"
	},
	{
		id: "check_docker",
		title: "Проверка Docker",
		description: "compose ps, рестарты, место образов.",
		inputs: "server",
		validation: "docker доступен учётка",
		risk: 0,
		targets: "mail01",
		executor: "ansible",
		timeout: "45 с",
		rollback: "не нужен",
		verification: "список контейнеров"
	},
	{
		id: "check_mailcow",
		title: "Проверка Mailcow",
		description: "Разбор сервисов, а не дамп логов.",
		inputs: "server",
		validation: "роль mailcow",
		risk: 0,
		targets: "mail01",
		executor: "ansible",
		timeout: "2 мин",
		rollback: "не нужен",
		verification: "статус каждого сервиса"
	},
	{
		id: "check_disk",
		title: "Место на дисках",
		description: "Свободное место по всем серверам inventory.",
		inputs: "scope",
		validation: "inventory не пуст",
		risk: 0,
		targets: "все",
		executor: "semaphore",
		timeout: "2 мин",
		rollback: "не нужен",
		verification: "процент по каждому тому"
	},
	{
		id: "check_mikrotik",
		title: "Диагностика MikroTik",
		description: "Интерфейсы, маршруты, NAT, DHCP, DNS. Только чтение.",
		inputs: "router",
		validation: "API доступен",
		risk: 0,
		targets: "rb5009",
		executor: "jarvis-mikrotik",
		timeout: "30 с",
		rollback: "не нужен",
		verification: "снимок интерфейсов"
	},
	{
		id: "check_wireguard",
		title: "WireGuard",
		description: "Handshake и peer status. Без изменения peer.",
		inputs: "router",
		validation: "интерфейс wg есть",
		risk: 0,
		targets: "rb5009",
		executor: "RouterOS API",
		timeout: "20 с",
		rollback: "не нужен",
		verification: "last-handshake"
	},
	{
		id: "backup_sql_database",
		title: "Backup базы SQL",
		description: "Утверждённый шаблон, не новый PowerShell из модели.",
		inputs: "server, database, destination",
		validation: "ONLINE, место, нет другого backup",
		risk: 1,
		targets: "sql01",
		executor: "jarvis-backup",
		timeout: "45 мин",
		rollback: "снять незавершённый файл",
		verification: "размер, checksum, RESTORE VERIFYONLY"
	},
	{
		id: "backup_mikrotik",
		title: "Export MikroTik",
		description: "Сначала копия конфигурации. Правила не меняются.",
		inputs: "router",
		validation: "API read+backup",
		risk: 1,
		targets: "rb5009",
		executor: "jarvis-mikrotik",
		timeout: "2 мин",
		rollback: "файл export можно удалить",
		verification: "файл export сохранён"
	},
	{
		id: "restart_service",
		title: "Рестарт службы",
		description: "Только служба из allowlist.",
		inputs: "server, service",
		validation: "служба разрешена",
		risk: 2,
		targets: "srv1c01",
		executor: "semaphore",
		timeout: "3 мин",
		rollback: "запустить службу снова",
		verification: "state running и порт"
	},
	{
		id: "restart_1c",
		title: "Рестарт агента 1С",
		description: "Короткий разрыв сессий кластера.",
		inputs: "server",
		validation: "нет запрета в окне без approval",
		risk: 2,
		targets: "srv1c01",
		executor: "semaphore",
		timeout: "5 мин",
		rollback: "старт ragent",
		verification: "1540 слушает"
	},
	{
		id: "deploy_project",
		title: "Деплой",
		description: "Только после тестов и approval. Не в main напрямую.",
		inputs: "repo, ref",
		validation: "ветка не main",
		risk: 2,
		targets: "разрешённые repo",
		executor: "coding-agent",
		timeout: "20 мин",
		rollback: "предыдущий релиз",
		verification: "health после выкладки"
	},
	{
		id: "rollback_project",
		title: "Откат релиза",
		description: "Вернуть предыдущий артефакт. Требует подтверждения.",
		inputs: "repo, release",
		validation: "есть предыдущий релиз",
		risk: 2,
		targets: "billing",
		executor: "semaphore",
		timeout: "15 мин",
		rollback: "повторный деплой текущего",
		verification: "версия и health"
	},
	{
		id: "git_ci_diagnostics",
		title: "Разбор CI",
		description: "Статус workflow, упавший job, без push.",
		inputs: "repo",
		validation: "repo в allowlist",
		risk: 0,
		targets: "company/billing",
		executor: "jarvis-github",
		timeout: "30 с",
		rollback: "не нужен",
		verification: "имя job и ошибка"
	}
];
var ACCOUNTS = [
	{
		id: "jarvis-linux",
		scope: "SSH и Ansible, без sudo на всё"
	},
	{
		id: "jarvis-windows",
		scope: "WinRM, чтение и узкий restart"
	},
	{
		id: "jarvis-sql",
		scope: "backup и чтение, не sysadmin"
	},
	{
		id: "jarvis-backup",
		scope: "запись только в каталог backup"
	},
	{
		id: "jarvis-mikrotik",
		scope: "API read, backup отдельным правом"
	},
	{
		id: "jarvis-github",
		scope: "чтение CI, PR без права на main"
	}
];
var SERVICES = [
	{
		name: "PostgreSQL",
		state: "модель"
	},
	{
		name: "Redis",
		state: "модель"
	},
	{
		name: "Whisper",
		state: "модель"
	},
	{
		name: "Semaphore",
		state: "модель"
	},
	{
		name: "Telegram",
		state: "модель"
	},
	{
		name: "worker",
		state: "модель"
	}
];
var FLEET = [
	{
		label: "dc01",
		state: "ok",
		detail: "AD, DNS и DHCP отвечают. Репликация без отставания."
	},
	{
		label: "srv1c01",
		state: "ok",
		detail: "ragent и rmngr запущены. Сессий: 14."
	},
	{
		label: "sql01",
		state: "ok",
		detail: "База utp в состоянии ONLINE."
	},
	{
		label: "fs01",
		state: "ok",
		detail: "Том E: занято 62%."
	},
	{
		label: "mail01",
		state: "warn",
		detail: "Почта жива. Сертификат ACME не продлился."
	},
	{
		label: "rb5009",
		state: "warn",
		detail: "Основной канал поднят. Резервный LTE молчит 14 ч."
	}
];
function spec(partial) {
	return partial;
}
var SPECS = {
	check_fleet: spec({
		id: "check_fleet",
		title: "Состояние площадки",
		normalized: "check_fleet",
		risk: 0,
		tool: "check_servers",
		target: "inventory",
		runbook: "check_windows_server",
		account: "jarvis-windows / jarvis-linux",
		parameters: [{
			key: "scope",
			value: "all"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Сверить цели с inventory, не с текстом модели.",
			"Опросить службы, диск и доступность. Ничего не менять.",
			"Собрать короткие выводы по каждому узлу."
		],
		toolCall: "check_servers(scope: \"all\")",
		consequences: ["Только чтение. Сессии и маршруты не затрагиваются."],
		findings: FLEET,
		recommendation: "Имеет смысл отдельно открыть Mailcow и резервный канал: там предупреждения.",
		durationMs: 2400
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
		parameters: [{
			key: "server",
			value: "srv1c01"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Проверить службы кластера.",
			"Проверить лицензии и порт 1540.",
			"Проверить, что utp на sql01 ONLINE."
		],
		toolCall: "check_1c(server: \"srv1c01\")",
		consequences: ["Только чтение."],
		findings: [
			{
				label: "ragent",
				state: "ok",
				detail: "Running. Последний рестарт 18 дней назад."
			},
			{
				label: "rmngr",
				state: "ok",
				detail: "Running. Рабочих процессов: 4."
			},
			{
				label: "Лицензии",
				state: "ok",
				detail: "Занято 37 из 50."
			},
			{
				label: "sql01 / utp",
				state: "ok",
				detail: "ONLINE, блокирующих сессий нет."
			},
			{
				label: "Диск C:",
				state: "ok",
				detail: "Свободно 41%."
			}
		],
		recommendation: "Сервер 1С сейчас не выглядит причиной массового отказа. Если не пускает конкретных людей — смотрите сеансы и сеть, не рестарт.",
		durationMs: 1800
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
		parameters: [{
			key: "server",
			value: "sql01"
		}, {
			key: "database",
			value: "utp"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Найти базу в карте баз.",
			"Прочитать состояние и последний backup.",
			"Не запускать backup и restore."
		],
		toolCall: "check_database(server: \"sql01\", database: \"utp\")",
		consequences: ["Только чтение. Резервная копия не создаётся."],
		findings: [
			{
				label: "Состояние",
				state: "ok",
				detail: "ONLINE."
			},
			{
				label: "Размер",
				state: "info",
				detail: "Данные 18.4 ГБ, журнал 2.1 ГБ."
			},
			{
				label: "Последний backup",
				state: "ok",
				detail: "Сегодня 02:10, VERIFYONLY прошёл."
			},
			{
				label: "Активный backup",
				state: "ok",
				detail: "Сейчас не выполняется."
			}
		],
		recommendation: "База доступна. Новый backup — отдельная команда.",
		durationMs: 900
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
		parameters: [{
			key: "server",
			value: "dc01"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Чтение репликации, DNS и DHCP.", "Не менять группы Domain Admins и GPO."],
		toolCall: "check_domain_controller(server: \"dc01\")",
		consequences: ["Только чтение. Учётка не Domain Admin."],
		findings: [
			{
				label: "Netlogon",
				state: "ok",
				detail: "Running."
			},
			{
				label: "Репликация",
				state: "ok",
				detail: "Отставания нет. Партнёр один, он сам."
			},
			{
				label: "DNS",
				state: "ok",
				detail: "Зоны AD отвечают."
			},
			{
				label: "DHCP",
				state: "ok",
				detail: "Пул офиса занят на 71%."
			}
		],
		recommendation: "Перезагрузка DC отсюда не предлагается.",
		durationMs: 1600
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
		parameters: [{
			key: "server",
			value: "mail01"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"compose ps, диск, память.",
			"Разобрать postfix, dovecot, nginx, acme, redis, sogo.",
			"Отдать вывод сервисами, не сырым логом."
		],
		toolCall: "check_mailcow(server: \"mail01\")",
		consequences: ["Только чтение. Контейнеры не перезапускаются."],
		findings: [
			{
				label: "Postfix",
				state: "ok",
				detail: "Очередь 3 письма, отказов за час нет."
			},
			{
				label: "Dovecot",
				state: "ok",
				detail: "IMAP отвечает."
			},
			{
				label: "Nginx",
				state: "ok",
				detail: "HTTPS слушает."
			},
			{
				label: "Redis",
				state: "ok",
				detail: "Отвечает на ping."
			},
			{
				label: "SOGo",
				state: "ok",
				detail: "Контейнер up."
			},
			{
				label: "Диск",
				state: "warn",
				detail: "Занято 88%. Порог внимания 85%."
			},
			{
				label: "ACME",
				state: "bad",
				detail: "Продление ночью упало. Сертификат истекает через 9 дней."
			}
		],
		recommendation: "Почта сейчас работает. Дальше — место на диске и отдельное подтверждение на renew сертификата. Само renew из этой команды не запускается.",
		durationMs: 2100
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
		parameters: [{
			key: "server",
			value: "mail01"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Снять compose ps.", "Не делать prune и не останавливать контейнеры."],
		toolCall: "check_docker(server: \"mail01\")",
		consequences: ["Только чтение."],
		findings: [
			{
				label: "Контейнеры",
				state: "ok",
				detail: "11 up."
			},
			{
				label: "acme-mailcow",
				state: "bad",
				detail: "Restarting. Код выхода прошлого прогона: 1."
			},
			{
				label: "Место образов",
				state: "warn",
				detail: "Docker root занял 41 ГБ."
			}
		],
		recommendation: "Чистка образов была бы изменением. Сначала отчёт, prune только отдельной утверждённой задачей.",
		durationMs: 1200
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
		parameters: [{
			key: "scope",
			value: "all"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Обойти inventory.",
			"Снять занятость томов.",
			"Ничего не удалять."
		],
		toolCall: "check_disk(scope: \"all\")",
		consequences: ["Только чтение. Файлы не удаляются."],
		findings: [
			{
				label: "dc01 C:",
				state: "ok",
				detail: "Свободно 48%."
			},
			{
				label: "srv1c01 C:",
				state: "ok",
				detail: "Свободно 41%."
			},
			{
				label: "sql01 E:",
				state: "ok",
				detail: "Свободно 36%. Хватает на полный backup utp."
			},
			{
				label: "fs01 E:",
				state: "ok",
				detail: "Свободно 38%."
			},
			{
				label: "mail01 /",
				state: "warn",
				detail: "Свободно 12%."
			},
			{
				label: "NAS backup",
				state: "ok",
				detail: "Свободно 2.4 ТБ."
			}
		],
		recommendation: "Критичен только mail01. Очистку не запускаю: команда была про проверку.",
		durationMs: 2e3
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
		parameters: [{
			key: "router",
			value: "rb5009"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Считать peer и handshake через API.", "Ключи и peer не менять."],
		toolCall: "check_wireguard(router: \"rb5009\")",
		consequences: ["Только чтение."],
		findings: [{
			label: "wg-office",
			state: "ok",
			detail: "Handshake 12 секунд назад. Туннель жив."
		}, {
			label: "wg-admin",
			state: "warn",
			detail: "Peer phone-admin молчит 3 часа."
		}],
		recommendation: "Это похоже на выключенный телефон, не на поломку интерфейса. Удалять peer нельзя без отдельного подтверждения.",
		durationMs: 700
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
		parameters: [{
			key: "router",
			value: "rb5009"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["API: интерфейсы, адреса, маршруты, NAT, firewall filter — чтение.", "Перед любой правкой сначала export. Сейчас правки нет."],
		toolCall: "check_mikrotik(router: \"rb5009\")",
		consequences: ["Только чтение. Firewall и маршруты не меняются."],
		findings: [
			{
				label: "ether1",
				state: "ok",
				detail: "WAN, link up."
			},
			{
				label: "bridge-lan",
				state: "ok",
				detail: "Порты офиса up."
			},
			{
				label: "Маршрут",
				state: "ok",
				detail: "0.0.0.0/0 через ISP-A."
			},
			{
				label: "Firewall",
				state: "info",
				detail: "Фильтр на месте. Изменений в этой команде нет."
			}
		],
		recommendation: "Диагностика спокойная. Любое изменение filter, NAT, VLAN или WAN — уровень 3: export, план, два подтверждения.",
		durationMs: 1100
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
		parameters: [{
			key: "router",
			value: "rb5009"
		}, {
			key: "focus",
			value: "wan"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Посмотреть основной и резервный канал.", "Не переключать маршрут и не трогать firewall."],
		toolCall: "check_mikrotik(router: \"rb5009\", focus: \"wan\")",
		consequences: ["Только чтение. Отказоустойчивость не перенастраивается."],
		findings: [
			{
				label: "ISP-A / ether1",
				state: "ok",
				detail: "Link up. До 1.1.1.1 ответ есть."
			},
			{
				label: "ISP-B / lte1",
				state: "bad",
				detail: "Интерфейс не running. Последний раз был поднят 14 часов назад."
			},
			{
				label: "Failover",
				state: "info",
				detail: "Сейчас не нужен: основной канал жив. Запасного пути нет, пока LTE лежит."
			}
		],
		recommendation: "Похоже на питание или регистрацию модема, не на маршрут. Включать другой default route без подтверждения нельзя. Сначала export конфигурации.",
		durationMs: 1300
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
			{
				key: "server",
				value: "sql01"
			},
			{
				key: "database",
				value: "utp"
			},
			{
				key: "destination",
				value: "nas-backup/sql"
			}
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
			"Проверить файл, размер и RESTORE VERIFYONLY."
		],
		toolCall: "backup_database(server: \"sql01\", database: \"utp\")",
		consequences: [
			"Нагрузка на SQL на время снимка.",
			"Новый файл .bak на NAS.",
			"База не перезаписывается и не удаляется."
		],
		findings: [
			{
				label: "Доступность",
				state: "ok",
				detail: "sql01 и каталог backup отвечают."
			},
			{
				label: "База",
				state: "ok",
				detail: "utp ONLINE. Другого backup нет."
			},
			{
				label: "Место",
				state: "ok",
				detail: "На NAS свободно 2.4 ТБ."
			},
			{
				label: "Файл",
				state: "ok",
				detail: "utp_2026-10-06_14-06-22.bak"
			},
			{
				label: "Размер",
				state: "ok",
				detail: "4.82 ГБ, не пустой."
			},
			{
				label: "VERIFYONLY",
				state: "ok",
				detail: "SQL принял набор backup. Это не тестовое восстановление."
			}
		],
		recommendation: "Файл на месте и прошёл VERIFYONLY. Настоящая проверка — восстановление во временную базу. Оно по расписанию раз в неделю, этой командой не делается.",
		durationMs: 12600
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
		parameters: [{
			key: "router",
			value: "rb5009"
		}],
		confirmation: "none",
		mutation: true,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Снять export и binary backup.", "Правила firewall, NAT и WireGuard не менять."],
		toolCall: "backup_mikrotik(router: \"rb5009\")",
		consequences: ["Появится файл export. Маршрутизация не меняется."],
		findings: [{
			label: "Export",
			state: "ok",
			detail: "rb5009_2026-10-06.rsc сохранён в хранилище контура."
		}, {
			label: "Изменения",
			state: "ok",
			detail: "Текущие правила не редактировались."
		}],
		recommendation: "Копия есть. Её нужно снять ещё раз непосредственно перед любой правкой уровня 3.",
		durationMs: 1500
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
		parameters: [{
			key: "server",
			value: "srv1c01"
		}, {
			key: "service",
			value: "1C:Enterprise 8.3 Server Agent"
		}],
		confirmation: "single",
		mutation: true,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Служба в allowlist. Произвольный Restart-Service из текста не собирается.",
			"Показать последствия и номер заявки.",
			"После точной фразы — шаблон restart_1c, затем проверка порта."
		],
		toolCall: "restart_service(server: \"srv1c01\", service: \"1C:Enterprise 8.3 Server Agent\")",
		consequences: [
			"Сессии кластера оборвутся.",
			"Пользователи 1С на несколько минут потеряют соединение.",
			"Сейчас активных сессий: 14."
		],
		findings: [
			{
				label: "Остановка",
				state: "info",
				detail: "Шаблон остановил агент."
			},
			{
				label: "Запуск",
				state: "ok",
				detail: "Служба снова Running."
			},
			{
				label: "Порт 1540",
				state: "ok",
				detail: "Слушает."
			},
			{
				label: "Сессии",
				state: "info",
				detail: "Сразу после старта: 0. Люди заходят заново."
			}
		],
		recommendation: "В этой демо-консоли служба на srv1c01 не трогалась. Отчёт — эталон шаблона после подтверждения.",
		durationMs: 8400
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
		parameters: [{
			key: "server",
			value: "dc01"
		}],
		confirmation: "double",
		mutation: true,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Это контроллер домена, DNS и DHCP.",
			"Два подтверждения одной заявки. Слово «да» не считается.",
			"Даже после них демо не шлёт reboot: хост не подключён."
		],
		toolCall: "reboot_server(server: \"dc01\")",
		consequences: [
			"На время уйдут вход в домен, DNS и DHCP.",
			"1С и почта могут перестать резолвить имена.",
			"Активных пользователей в оценке: 14."
		],
		findings: [{
			label: "Заявка",
			state: "info",
			detail: "Оба этапа подтверждены в срок."
		}, {
			label: "Исполнение",
			state: "warn",
			detail: "Reboot на dc01 не отправлялся. В контуре нет живого WinRM."
		}],
		recommendation: "В рабочей системе здесь был бы approved runbook и окно отката, не свободная команда shutdown.",
		durationMs: 400
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
		plan: [
			"Уточните хост из inventory.",
			"Для dc01 будет два подтверждения.",
			"Пока хост не назван, инструмент не выбирается."
		],
		toolCall: "reboot_server(server: ?)  — не сформирован",
		consequences: ["Ничего не выполнено."],
		findings: [],
		recommendation: "Назовите сервер явно, например: перезагрузи контроллер домена.",
		durationMs: 0
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
		durationMs: 0
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
		parameters: [{
			key: "period",
			value: "today"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Собрать backup, диски и упавшие службы.", "Ничего не чинить в этом проходе."],
		toolCall: "daily_report(period: \"today\")",
		consequences: ["Только чтение."],
		findings: [
			{
				label: "Backup utp",
				state: "ok",
				detail: "Ночной снимок есть, VERIFYONLY прошёл."
			},
			{
				label: "Службы Windows",
				state: "ok",
				detail: "Автозапуск без остановленных."
			},
			{
				label: "mail01",
				state: "warn",
				detail: "Диск 88%, ACME в ошибке."
			},
			{
				label: "LTE",
				state: "warn",
				detail: "Резервный канал не running."
			}
		],
		recommendation: "Два хвоста на сегодня: сертификат почты и модем. Оба требуют отдельных команд, не этого отчёта.",
		durationMs: 1500
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
		parameters: [{
			key: "server",
			value: "srv1c01"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Сначала факты: службы, лицензии, SQL, сеть.", "Не перезапускать кластер, пока нет доказанной причины."],
		toolCall: "check_1c(server: \"srv1c01\", focus: \"logon\")",
		consequences: ["Только чтение. Рестарт не предлагается как действие."],
		findings: [
			{
				label: "Службы",
				state: "ok",
				detail: "Кластер поднят."
			},
			{
				label: "Лицензии",
				state: "ok",
				detail: "Запас есть: 37 из 50."
			},
			{
				label: "SQL",
				state: "ok",
				detail: "utp ONLINE, таймаутов к 1541 нет."
			},
			{
				label: "Сеть",
				state: "warn",
				detail: "С подсети терминалов 10.2.8.0/24 до порта 1540 сегодня были отказы."
			}
		],
		recommendation: "Похоже на сеть или firewall до srv1c01, не на упавший агент. Рестарт 1С это не лечит. Правило firewall само не меняю.",
		durationMs: 2200
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
		parameters: [{
			key: "repo",
			value: "company/billing"
		}, {
			key: "branch",
			value: "fix/invoice-rounding"
		}],
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
			"PR и релиз этой командой не открываются."
		],
		toolCall: "coding_agent(repo: \"company/billing\", branch: \"fix/invoice-rounding\")",
		consequences: ["Локальный коммит в ветке, если подтвердите.", "main, merge и release не затрагиваются."],
		findings: [
			{
				label: "Diff",
				state: "info",
				detail: "src/invoice/round.ts +18 / −6. Округление до копейки."
			},
			{
				label: "Тесты",
				state: "ok",
				detail: "billing.test.ts: 42 прошли."
			},
			{
				label: "Коммит",
				state: "ok",
				detail: "Создан только в ветке fix/invoice-rounding."
			},
			{
				label: "main",
				state: "ok",
				detail: "Push в main не выполнялся. Политика его запрещает."
			}
		],
		recommendation: "Дальше человек смотрит diff и отдельно решает, открывать ли PR. Прямой push в main отсюда закрыт.",
		durationMs: 6400
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
		parameters: [{
			key: "repo",
			value: "company/billing"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: ["Прочитать последний workflow run.", "Не перезапускать и не пушить."],
		toolCall: "git_ci_diagnostics(repo: \"company/billing\")",
		consequences: ["Только чтение."],
		findings: [
			{
				label: "Workflow",
				state: "bad",
				detail: "CI run 1842, ветка fix/invoice-rounding."
			},
			{
				label: "Job test",
				state: "bad",
				detail: "round: ожидали 1.20, получили 1.25."
			},
			{
				label: "main",
				state: "ok",
				detail: "Защищён. Этот разбор ничего не запушил."
			}
		],
		recommendation: "Падение в округлении счёта. Чинить можно отдельной командой на агента. В main само не уедет.",
		durationMs: 980
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
		parameters: [{
			key: "repo",
			value: "company/billing"
		}, {
			key: "to",
			value: "предыдущий релиз"
		}],
		confirmation: "single",
		mutation: true,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Показать, какой релиз станет текущим.",
			"Дождаться точной фразы.",
			"Не откатывать, пока это только демо."
		],
		toolCall: "rollback_project(repo: \"company/billing\", to: \"previous\")",
		consequences: ["Пользователи billing увидят предыдущую версию.", "Текущий релиз останется для возврата."],
		findings: [{
			label: "План отката",
			state: "info",
			detail: "Текущий v1.8.3 → предыдущий v1.8.2."
		}, {
			label: "Исполнение",
			state: "warn",
			detail: "Выкладка не менялась: цель не подключена."
		}],
		recommendation: "Подтверждение здесь проверяет дисциплину, а не катит реальный откат.",
		durationMs: 500
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
		parameters: [{
			key: "scope",
			value: "report-only"
		}],
		confirmation: "none",
		mutation: false,
		forceDeny: false,
		clarify: false,
		denyReason: null,
		clarifyReason: null,
		plan: [
			"Фраза не задаёт, что удалять.",
			"Не превращать её в очистку диска, docker prune или rm.",
			"Снять только отчёт: место, журналы, размер docker."
		],
		toolCall: "check_disk(scope: \"report-only\")",
		consequences: ["Файлы не удаляются. Команда shell не собирается."],
		findings: [
			{
				label: "mail01 /",
				state: "warn",
				detail: "Свободно 12%. Крупное: журналы почты и docker root."
			},
			{
				label: "Остальные",
				state: "ok",
				detail: "Ниже порога внимания."
			},
			{
				label: "Удаление",
				state: "info",
				detail: "Не предложено и не поставлено в очередь."
			}
		],
		recommendation: "Если нужна уборка, назовите объект: журналы старше 30 дней на mail01. Это будет уровень 2 с подтверждением, не эта команда.",
		durationMs: 1600
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
		parameters: [{
			key: "branch",
			value: "main"
		}],
		confirmation: "none",
		mutation: true,
		forceDeny: true,
		clarify: false,
		denyReason: "Прямой push в main или master запрещён. Подтверждение это не открывает.",
		clarifyReason: null,
		plan: ["Отклонить до вызова git.", "Рабочий путь: ветка, тесты, diff, approval, PR."],
		toolCall: "git_push(branch: \"main\")  — заблокирован",
		consequences: ["Репозиторий не изменён."],
		findings: [],
		recommendation: "Попросите правку в ветке. PR открывает человек или отдельное разрешение, не эта фраза.",
		durationMs: 0
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
		parameters: [{
			key: "database",
			value: "utp"
		}],
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
		durationMs: 0
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
		recommendation: "Например: проверь сервер, сделай резервную копию базы utp, проверь Mailcow.",
		durationMs: 0
	})
};
function normalize(raw) {
	return raw.toLowerCase().replace(/ё/g, "е").replace(/[«»"'`]/g, "").replace(/^джарвис[, ]+/, "").replace(/\s+/g, " ").trim();
}
function matchIntent(raw) {
	const s = normalize(raw);
	if (!s) return "unknown";
	if (/удал\S*\s+баз(а|у|ы|е|ой)?(\s|$)|снеси\s+баз(у|ы)?(\s|$)|drop\s+database|delete\s+database/.test(s)) return "delete_db";
	if (/(пуш\S*|push).{0,48}(main|master)|(main|master).{0,24}(пуш|push)/.test(s)) return "push_main";
	if (/почист|очисти сервер|clean up|cleanup/.test(s)) return "clean_server";
	if (/проверь/.test(s) && /(баз|utp|ютп|sql)/.test(s) && !/(backup|бэкап|бекап|копи)/.test(s)) return "check_sql";
	if (/(backup|бэкап|бекап|резерв\S*\s+копи\S*).{0,40}(utp|ютп)|(utp|ютп).{0,40}(backup|бэкап|бекап|копи)/.test(s)) return "backup_utp";
	if (/(бэкап|backup|export|сохрани\S*).{0,32}(mikrotik|микротик|rb5009)|(mikrotik|микротик|rb5009).{0,32}(бэкап|backup|export|конфиг)/.test(s)) return "backup_mikrotik";
	if (/mailcow|мейлкау|почтов\S* сервер/.test(s)) return "check_mailcow";
	if (/wireguard|вайргард|вайр гард/.test(s)) return "check_wireguard";
	if (/github|actions|пайплайн/.test(s)) return "git_ci";
	if (/исправ\S* ошиб|прогони тест|почини код/.test(s)) return "coding";
	if (/перезагруз|reboot|ребут/.test(s)) return /dc01|контроллер|домен/.test(s) ? "reboot_dc" : "reboot_ambiguous";
	if (/перезапуст/.test(s)) return /1с|1c|агент/.test(s) ? "restart_1c" : "restart_ambiguous";
	if (/откат|rollback/.test(s)) return "rollback_project";
	if (/резерв\S* интернет|второй канал|запасн\S* канал|не работает интернет/.test(s)) return "check_wan";
	if (/не заходят|не пускает|не могут войти|почему.{0,24}1с|почему.{0,24}1c/.test(s)) return "why_1c";
	if (/свобод\S* мест|место на диск|на всех сервер/.test(s)) return "check_disk";
	if (/отчет|сводк/.test(s)) return "daily_report";
	if (/docker|докер/.test(s)) return "check_docker";
	if (/(проверь|состоян|статус).{0,24}(1с|1c)|(1с|1c).{0,16}(сервер|кластер)/.test(s)) return "check_1c";
	if (/контроллер|dc01|(^|\s)dc(\s|$)/.test(s)) return "check_dc";
	if (/mikrotik|микротик|rb5009|маршрутизатор/.test(s)) return "check_mikrotik";
	if (/проверь сервер|состояние площад|статус сервер/.test(s)) return "check_fleet";
	return "unknown";
}
function inMaintenance(now) {
	const hour = now.getHours();
	return hour >= 22 || hour < 6;
}
function confirmText(kind) {
	if (kind === "double") return "два этапа";
	if (kind === "single") return "одна фраза с номером";
	return "не требуется";
}
function evaluate(raw, operator, now) {
	const specItem = SPECS[matchIntent(raw)];
	const windowOpen = inMaintenance(now);
	const notes = [
		`Пользователь: ${operator.name}`,
		`Telegram ID: ${operator.allowed ? String(operator.telegramId) : "нет в allowlist"}`,
		`Действие: ${specItem.tool}`,
		`Цель: ${specItem.target}`,
		`Риск: L${specItem.risk} ${RISK_LABEL[specItem.risk]}`,
		`Схема инструмента: ${specItem.forceDeny ? "нет" : "да"}`,
		`Подтверждение: ${confirmText(specItem.confirmation)}`,
		windowOpen ? "Окно 22:00–06:00: сейчас внутри. Для изменений фраза всё равно нужна." : specItem.risk >= 2 ? "Окно 22:00–06:00: сейчас вне окна. Для изменения нужно подтверждение." : "Окно обслуживания чтение и низкий риск не блокирует.",
		`Учётка: ${specItem.account}`
	];
	let verdict = "allow";
	let reason = null;
	if (!operator.allowed) {
		verdict = "deny";
		reason = "Этот Telegram ID не в allowlist. Имя аккаунта не проверяется.";
	} else if (specItem.forceDeny) {
		verdict = "deny";
		reason = specItem.denyReason;
	} else if (specItem.clarify) {
		verdict = "clarify";
		reason = specItem.clarifyReason;
	}
	return {
		...specItem,
		verdict,
		reason,
		policyNotes: notes
	};
}
function formatClock(ts) {
	return new Intl.DateTimeFormat("ru-RU", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	}).format(ts);
}
function formatLeft(ms) {
	const total = Math.max(0, Math.ceil(ms / 1e3));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}
var APPROVAL_TTL_MS = 3e5;
var REPAIRS = [
	[/^(жарвис|чарвис|зарвис|дарвис|гарвис|джарвис)[, ]+/, ""],
	[/мейл\s*кау|мейл\s*ков|мейл\s*коу|мэйл\s*ков|майл\s*ков|майлков|мелков|мылков|мылкоу|мейлкоу|мейлкау|mail\s*cow/g, "mailcow"],
	[/вайр\s*гард\S*|вайер\s*гард\S*|ваергард\S*|wire\s*guard/g, "wireguard"],
	[/майкро\s*тик|микро\s*тик/g, "mikrotik"],
	[/гит\s*хаб|git\s*hub/g, "github"],
	[/экшенс|экшнс|экшены/g, "actions"],
	[/ютэпэ|ю\s*т\s*п|у\s*т\s*п|утипи|ютип/g, "utp"],
	[/(^|\s)один эс(\s|$)/g, "$11с$2"],
	[/(^|\s)один с(\s|$)/g, "$11с$2"],
	[/проверь почт\S*/g, "проверь mailcow"],
	[/(^|\s)сервак\S*/g, "$1сервер"],
	[/проверь север/g, "проверь сервер"],
	[/чекни/g, "проверь"],
	[/бекап/g, "бэкап"],
	[/(^|\s)ди\s*си(\s|$)/g, "$1контроллер домена$2"],
	[/(^|\s)дц(\s|$)/g, "$1контроллер домена$2"]
];
var SAFE = [
	{
		say: "Проверь Mailcow",
		keys: ["mailcow", "почт"]
	},
	{
		say: "Сделай резервную копию базы utp",
		keys: [
			"utp",
			"бэкап",
			"копи"
		]
	},
	{
		say: "Проверь базу utp",
		keys: ["базу utp", "базу"]
	},
	{
		say: "Проверь сервер",
		keys: ["сервер", "площад"]
	},
	{
		say: "Проверь сервер 1С",
		keys: ["1с"]
	},
	{
		say: "Проверь свободное место на всех серверах",
		keys: ["место", "диск"]
	},
	{
		say: "Посмотри WireGuard",
		keys: ["wireguard"]
	},
	{
		say: "Проверь MikroTik",
		keys: ["mikrotik", "маршрутизатор"]
	},
	{
		say: "Почему не работает резервный интернет",
		keys: ["интернет", "канал"]
	},
	{
		say: "Почему пользователи не заходят в 1С",
		keys: ["не заходят", "не пускает"]
	},
	{
		say: "Почему GitHub Actions упал",
		keys: ["github", "actions"]
	},
	{
		say: "Проверь Docker",
		keys: ["docker", "докер"]
	},
	{
		say: "Сделай отчёт за сегодня",
		keys: ["отчет", "сводк"]
	},
	{
		say: "Почисти сервер",
		keys: ["почисти", "очисти"]
	},
	{
		say: "Проверь контроллер домена",
		keys: ["контроллер"]
	}
];
function repairSpeech(raw) {
	let text = normalize(raw);
	for (const [pattern, next] of REPAIRS) text = text.replace(pattern, next);
	return text.replace(/\s+/g, " ").trim();
}
function alternativesFrom(results) {
	const chunks = [];
	for (let i = 0; i < results.length; i += 1) chunks.push(results[i]);
	if (!chunks.length) return [];
	const finals = chunks.filter((item) => item.isFinal);
	const tail = chunks[chunks.length - 1];
	const headText = (tail && !tail.isFinal ? finals : finals.slice(0, -1)).map((item) => item[0]?.transcript ?? "").join(" ").trim();
	const varied = tail && !tail.isFinal ? tail : finals[finals.length - 1];
	const count = varied?.length ?? 1;
	const alts = [];
	for (let index = 0; index < count; index += 1) {
		const transcript = `${headText} ${varied?.[index]?.transcript?.trim() ?? ""}`.trim();
		if (!transcript) continue;
		alts.push({
			transcript,
			confidence: varied?.[index]?.confidence ?? 0
		});
	}
	if (!alts.length && headText) alts.push({
		transcript: headText,
		confidence: 1
	});
	return alts;
}
function grams(input) {
	const map = /* @__PURE__ */ new Map();
	const text = ` ${input} `;
	for (let i = 0; i < text.length - 1; i += 1) {
		const gram = text.slice(i, i + 2);
		map.set(gram, (map.get(gram) ?? 0) + 1);
	}
	return map;
}
function dice(leftText, rightText) {
	if (!leftText || !rightText) return 0;
	if (leftText === rightText) return 1;
	const left = grams(leftText);
	const right = grams(rightText);
	let overlap = 0;
	let leftCount = 0;
	let rightCount = 0;
	for (const value of left.values()) leftCount += value;
	for (const value of right.values()) rightCount += value;
	for (const [gram, value] of left) overlap += Math.min(value, right.get(gram) ?? 0);
	return 2 * overlap / (leftCount + rightCount);
}
function fuzzyScore(heard, item) {
	const say = normalize(item.say);
	const keyHit = item.keys.some((key) => heard.includes(normalize(key)));
	const similarity = dice(heard, say);
	if (!keyHit) return similarity < .86 ? similarity * .45 : similarity;
	return Math.max(similarity, .7);
}
function interpretSpeech(alts) {
	const cleaned = alts.map((alt) => ({
		raw: alt.transcript.trim(),
		text: repairSpeech(alt.transcript),
		confidence: alt.confidence
	})).filter((alt) => alt.raw || alt.text);
	if (!cleaned.length) return {
		raw: "",
		text: "",
		changed: false,
		uncertain: false,
		choices: []
	};
	const best = cleaned.map((alt) => ({
		...alt,
		intent: matchIntent(alt.text)
	})).sort((a, b) => {
		const known = Number(b.intent !== "unknown") - Number(a.intent !== "unknown");
		if (known !== 0) return known;
		if (b.confidence !== a.confidence) return b.confidence - a.confidence;
		return b.text.length - a.text.length;
	})[0];
	if (best.intent !== "unknown") {
		const canon = SAFE.filter((item) => matchIntent(item.say) === best.intent);
		const text = canon.length === 1 ? canon[0].say : best.text;
		return {
			raw: best.raw,
			text,
			changed: normalize(best.raw) !== normalize(text),
			uncertain: false,
			choices: []
		};
	}
	const basis = cleaned.slice().sort((a, b) => b.text.length - a.text.length)[0];
	const scored = SAFE.map((item) => ({
		...item,
		score: fuzzyScore(basis.text, item)
	})).sort((a, b) => b.score - a.score);
	const top = scored[0];
	const second = scored[1];
	const lead = top.score - (second?.score ?? 0);
	if (top.score >= .72 && lead >= .08) return {
		raw: basis.raw,
		text: top.say,
		changed: true,
		uncertain: false,
		choices: []
	};
	if (top.score >= .62 && second && second.score >= .55 && lead < .08) return {
		raw: basis.raw,
		text: basis.text,
		changed: false,
		uncertain: true,
		choices: [{
			label: top.say,
			text: top.say
		}, {
			label: second.say,
			text: second.say
		}]
	};
	return {
		raw: basis.raw,
		text: basis.text || basis.raw,
		changed: normalize(basis.raw) !== (basis.text || basis.raw),
		uncertain: false,
		choices: []
	};
}
var n = 0;
function uid(prefix) {
	n += 1;
	return `${prefix}-${n}`;
}
function sleep$1(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
function operatorById(id) {
	return OPERATORS.find((item) => item.id === id) ?? OPERATORS[0];
}
function dayStamp(date) {
	const p = (value) => String(value).padStart(2, "0");
	return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}
function paramsOf(decision) {
	if (decision.parameters.length === 0) return "—";
	return decision.parameters.map((item) => `${item.key}=${item.value}`).join(", ");
}
function auditFrom(turn, user, result, error, approvalId) {
	return {
		id: uid("aud"),
		at: Date.now(),
		user,
		source: turn.source === "voice" ? "telegram-voice" : "telegram-text",
		request: turn.request,
		intent: turn.decision.normalized,
		tool: turn.decision.tool,
		target: turn.decision.target,
		parameters: paramsOf(turn.decision),
		risk: turn.decision.risk,
		approvalId,
		template: turn.decision.runbook ?? "—",
		result,
		exitCode: turn.exitCode,
		durationMs: turn.durationMs,
		error
	};
}
var lock = false;
var useJarvis = create((set, get) => ({
	operatorId: "admin1",
	dryRun: true,
	busy: false,
	now: 0,
	seq: 17,
	turns: [],
	audit: [],
	setOperator: (id) => set({ operatorId: id }),
	setDryRun: (value) => set({ dryRun: value }),
	tick: (ts) => {
		const state = get();
		const user = operatorById(state.operatorId).name;
		const extra = [];
		let changed = false;
		const turns = state.turns.map((turn) => {
			if (turn.phase !== "awaiting" || !turn.approval || ts <= turn.approval.expiresAt) return turn;
			changed = true;
			const next = {
				...turn,
				phase: "expired",
				hint: "Срок заявки истёк. Повторите команду."
			};
			extra.push(auditFrom(next, user, "expired", "approval ttl", turn.approval.id));
			return next;
		});
		if (!changed) {
			set({ now: ts });
			return;
		}
		set({
			now: ts,
			turns,
			audit: [...extra, ...state.audit].slice(0, 80)
		});
	},
	cancel: (turnId) => {
		const state = get();
		const turn = state.turns.find((item) => item.id === turnId);
		if (!turn || turn.phase !== "awaiting") return;
		const next = {
			...turn,
			phase: "cancelled",
			hint: "Заявка отменена. Ничего не менялось."
		};
		const user = operatorById(state.operatorId).name;
		set({
			turns: state.turns.map((item) => item.id === turnId ? next : item),
			audit: [auditFrom(next, user, "cancelled", null, turn.approval?.id ?? null), ...state.audit].slice(0, 80)
		});
	},
	reply: (turnId, phrase) => {
		const text = phrase.trim();
		if (!text) return;
		const state = get();
		const turn = state.turns.find((item) => item.id === turnId);
		if (!turn || turn.phase !== "awaiting" || !turn.approval) return;
		const user = operatorById(state.operatorId).name;
		const replies = [...turn.replies, text];
		if (/^(да|ок|ok|yes|подтверждаю|confirm)$/i.test(text)) {
			const next = {
				...turn,
				replies,
				hint: "Короткое «да» без номера заявки не принимаю."
			};
			set({ turns: state.turns.map((item) => item.id === turnId ? next : item) });
			return;
		}
		if (text !== turn.approval.phrase) {
			const next = {
				...turn,
				replies,
				hint: "Фраза не совпала с заявкой. Скопируйте её целиком."
			};
			set({ turns: state.turns.map((item) => item.id === turnId ? next : item) });
			return;
		}
		if (Date.now() > turn.approval.expiresAt) {
			const next = {
				...turn,
				replies,
				phase: "expired",
				hint: "Срок заявки истёк."
			};
			set({
				turns: state.turns.map((item) => item.id === turnId ? next : item),
				audit: [auditFrom(next, user, "expired", "approval ttl", turn.approval.id), ...state.audit].slice(0, 80)
			});
			return;
		}
		if (turn.decision.confirmation === "double" && turn.approval.stage === 1) {
			const phraseNext = `CONFIRM-FINAL ${turn.approval.id}`;
			const next = {
				...turn,
				replies,
				hint: "Первый этап принят. Нужна вторая фраза той же заявки.",
				approval: {
					...turn.approval,
					stage: 2,
					phrase: phraseNext
				}
			};
			set({
				turns: state.turns.map((item) => item.id === turnId ? next : item),
				audit: [auditFrom(next, user, "approval_stage_1", null, turn.approval.id), ...state.audit].slice(0, 80)
			});
			return;
		}
		const next = {
			...turn,
			replies,
			phase: "done",
			step: 4,
			executed: true,
			showFindings: true,
			hint: null,
			exitCode: 0,
			durationMs: turn.decision.durationMs
		};
		set({
			turns: state.turns.map((item) => item.id === turnId ? next : item),
			audit: [auditFrom(next, user, "simulated_ok", null, turn.approval.id), ...state.audit].slice(0, 80)
		});
	},
	submit: async (raw, source, heard) => {
		const text = raw.trim();
		if (!text || lock) return;
		const pending = get().turns.find((item) => item.phase === "awaiting");
		if (pending) {
			if (/^отмена$/i.test(text) || /^cancel$/i.test(text)) {
				get().cancel(pending.id);
				return;
			}
			get().reply(pending.id, text);
			return;
		}
		lock = true;
		set({ busy: true });
		try {
			const state = get();
			const operator = operatorById(state.operatorId);
			const decision = evaluate(text, operator, /* @__PURE__ */ new Date());
			const dryRun = state.dryRun;
			const id = uid("turn");
			const base = {
				id,
				source,
				request: text,
				heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
				at: Date.now(),
				phase: "running",
				step: 1,
				decision,
				approval: null,
				executed: false,
				showFindings: false,
				dryRun,
				exitCode: null,
				durationMs: null,
				hint: null,
				replies: []
			};
			set({ turns: [...state.turns, base] });
			for (let step = 2; step <= 4; step += 1) {
				await sleep$1(280);
				set({ turns: get().turns.map((item) => item.id === id ? {
					...item,
					step
				} : item) });
			}
			const user = operator.name;
			const readSnapshot = decision.verdict === "allow" && !decision.mutation;
			const needsApproval = decision.verdict === "allow" && !dryRun && decision.confirmation !== "none";
			const executeNow = decision.verdict === "allow" && !dryRun && decision.confirmation === "none";
			if (needsApproval) {
				const seq = get().seq + 1;
				const approvalId = `APPROVAL-${dayStamp(/* @__PURE__ */ new Date())}-${String(seq).padStart(4, "0")}`;
				const approval = {
					id: approvalId,
					stage: 1,
					expiresAt: Date.now() + APPROVAL_TTL_MS,
					phrase: `CONFIRM ${approvalId}`
				};
				const next = {
					...base,
					step: 4,
					phase: "awaiting",
					approval,
					dryRun
				};
				set({
					seq,
					turns: get().turns.map((item) => item.id === id ? next : item),
					audit: [auditFrom(next, user, "awaiting_approval", null, approvalId), ...get().audit].slice(0, 80)
				});
				return;
			}
			const showFindings = readSnapshot || executeNow;
			let result = "dry_run";
			if (decision.verdict === "deny") result = "denied";
			else if (decision.verdict === "clarify") result = "clarify";
			else if (executeNow) result = "simulated_ok";
			else if (readSnapshot) result = dryRun ? "read_dry_run" : "simulated_ok";
			const next = {
				...base,
				step: 4,
				phase: decision.verdict === "deny" ? "denied" : "done",
				executed: executeNow,
				showFindings,
				dryRun,
				exitCode: showFindings ? 0 : null,
				durationMs: showFindings ? decision.durationMs : null
			};
			set({
				turns: get().turns.map((item) => item.id === id ? next : item),
				audit: [auditFrom(next, user, result, decision.verdict === "allow" ? null : decision.reason, null), ...get().audit].slice(0, 80)
			});
		} finally {
			lock = false;
			set({ busy: false });
		}
	}
}));
var STEP_TEXT = [
	"Приём",
	"Намерение",
	"Политика",
	"Решение"
];
var STEP_VOICE = [
	"Whisper",
	"Намерение",
	"Политика",
	"Решение"
];
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
function createRecognizer() {
	if (typeof window === "undefined") return null;
	const host = window;
	const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
	if (!Ctor) return null;
	const rec = new Ctor();
	rec.lang = "ru-RU";
	rec.continuous = true;
	rec.interimResults = true;
	rec.maxAlternatives = 5;
	return rec;
}
function voiceNoteText(code) {
	if (code === "not-allowed" || code === "service-not-allowed") return "Нет доступа к микрофону. Разрешите запись и повторите.";
	if (code === "audio-capture") return "Микрофон не найден.";
	if (code === "network") return "Распознавание сейчас недоступно. Можно выбрать пример фразы.";
	if (code === "no-speech") return "Речь не разобрана. Скажите ещё раз или выберите пример.";
	if (code === "unsupported") return "Этот браузер не распознаёт речь. Ниже те же команды, как голосовое из Telegram.";
	return "Не удалось распознать. Повторите или выберите пример.";
}
function riskClass(risk) {
	if (risk === 0) return "bg-forest text-paper";
	if (risk === 3) return "bg-danger-deep text-paper";
	if (risk === 2) return "text-warn";
	return "text-fg";
}
function RiskBadge({ risk }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex min-h-6 items-center rounded-sm px-2 font-mono text-xs " + (risk === 0 || risk === 3 ? riskClass(risk) : `border border-line ${riskClass(risk)}`),
		children: [
			"L",
			risk,
			" · ",
			RISK_LABEL[risk]
		]
	});
}
function dotClass(state) {
	if (state === "ok") return "bg-moss";
	if (state === "warn") return "bg-warn";
	if (state === "bad") return "bg-danger";
	return "bg-subtle";
}
function stamp(turn) {
	if (turn.phase === "running") return "Разбор";
	if (turn.phase === "awaiting") return "Ждёт фразу";
	if (turn.phase === "expired") return "Срок истёк";
	if (turn.phase === "cancelled") return "Отменено";
	if (turn.decision.verdict === "deny") return "Отказ";
	if (turn.decision.verdict === "clarify") return "Без действия";
	if (turn.dryRun && turn.decision.mutation) return "DRY RUN · не выполнялось";
	if (turn.dryRun) return "DRY RUN · чтение";
	if (turn.executed) return "Симуляция шаблона";
	return "Готово";
}
function phaseTone(phase, verdict) {
	if (phase === "denied" || verdict === "deny") return "text-danger";
	if (phase === "awaiting" || phase === "expired" || verdict === "clarify") return "text-warn";
	if (phase === "cancelled") return "text-subtle";
	return "text-moss";
}
function Wave() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-8 items-center gap-1",
		"aria-hidden": "true",
		children: Array.from({ length: 12 }, (_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "wave-bar h-6 w-1 rounded-sm bg-moss",
			style: { animationDelay: `${index * 60}ms` }
		}, index))
	});
}
function Findings({ items }) {
	if (items.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "mt-4 flex flex-col gap-3",
		children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `mt-1.5 size-2 shrink-0 rounded-full ${dotClass(item.state)}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-medium",
					children: item.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-pretty text-sm text-muted",
					children: item.detail
				})]
			})]
		}, item.label))
	});
}
function ApprovalBox({ turn, now }) {
	const [value, setValue] = (0, import_react.useState)("");
	const reply = useJarvis((state) => state.reply);
	const cancel = useJarvis((state) => state.cancel);
	const approval = turn.approval;
	if (!approval || turn.phase !== "awaiting") return null;
	const stages = turn.decision.confirmation === "double" ? 2 : 1;
	const left = now > 0 ? formatLeft(approval.expiresAt - now) : "5:00";
	const ready = value.trim() === approval.phrase;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-4 rounded-sm border border-line bg-bg p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-medium",
					children: "Подтверждение"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-mono text-xs text-warn tabular-nums",
					children: [
						"этап ",
						approval.stage,
						"/",
						stages,
						" · ",
						left
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm text-muted",
				children: turn.decision.consequences.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm",
				children: "Введите фразу целиком. «Да» не подойдёт."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 break-all font-mono text-sm text-paper",
				children: approval.phrase
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value,
					onChange: (event) => setValue(event.target.value),
					"aria-label": "Фраза подтверждения",
					autoCapitalize: "off",
					autoCorrect: "off",
					spellCheck: false,
					className: "min-h-11 w-full rounded-sm border border-line bg-surface px-3 font-mono text-sm text-fg"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setValue(approval.phrase),
							className: "min-h-11 rounded-sm border border-line px-3 text-sm",
							children: "Вставить фразу"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: !ready,
							onClick: () => reply(turn.id, value),
							className: "min-h-11 rounded-sm bg-paper px-3 text-sm font-medium text-ink disabled:opacity-40",
							children: "Подтвердить"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => cancel(turn.id),
							className: "min-h-11 rounded-sm px-3 text-sm text-muted",
							children: "Отмена"
						})
					]
				})]
			})
		]
	});
}
function TurnCard({ turn, now }) {
	const labels = turn.source === "voice" ? STEP_VOICE : STEP_TEXT;
	const book = RUNBOOKS.find((item) => item.id === turn.decision.runbook);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "turn-in rounded-xl border border-line bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RiskBadge, { risk: turn.decision.risk }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: `font-mono text-xs ${phaseTone(turn.phase, turn.decision.verdict)}`,
					children: stamp(turn)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 text-lg font-semibold tracking-tight text-balance",
				children: turn.decision.title
			}),
			turn.decision.reason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-pretty text-sm text-fg",
				children: turn.decision.reason
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-3 flex flex-wrap gap-x-3 gap-y-1",
				children: labels.map((label, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: `font-mono text-xs ${index < turn.step ? "text-moss" : "text-subtle"}`,
					children: [
						index + 1,
						" ",
						label
					]
				}, label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 font-mono text-sm break-all text-paper",
				children: turn.decision.toolCall
			}),
			turn.decision.parameters.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 font-mono text-xs text-subtle",
				children: turn.decision.parameters.map((item) => `${item.key}=${item.value}`).join(" · ")
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "mt-4 flex list-decimal flex-col gap-1 pl-4 text-sm text-muted",
				children: turn.decision.plan.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "text-pretty",
					children: line
				}, line))
			}),
			turn.decision.mutation && !turn.showFindings && turn.decision.verdict === "allow" && turn.phase !== "awaiting" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 flex flex-col gap-1 text-sm text-muted",
				children: turn.decision.consequences.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
			}) : null,
			book ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 text-sm text-muted",
				children: [
					"Runbook ",
					book.title,
					". Исполнитель: ",
					book.executor,
					". Таймаут: ",
					book.timeout,
					". Откат: ",
					book.rollback,
					"."
				]
			}) : null,
			turn.showFindings ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 border-t border-line pt-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-subtle",
					children: "Отчёт шаблона, не живой опрос"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Findings, { items: turn.decision.findings })]
			}) : null,
			turn.hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-warn",
				children: turn.hint
			}) : null,
			turn.replies.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col gap-1",
				children: turn.replies.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "font-mono text-xs break-all text-subtle",
					children: line
				}, `${line}-${index}`))
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ApprovalBox, {
				turn,
				now
			}, turn.approval?.phrase ?? "none"),
			turn.phase !== "running" && turn.phase !== "awaiting" && turn.decision.recommendation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 text-pretty text-sm",
				children: turn.decision.recommendation
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "text-sm text-muted",
					children: "След политики"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 flex flex-col gap-1 font-mono text-xs text-subtle",
					children: turn.decision.policyNotes.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: line }, line))
				})]
			}),
			turn.durationMs != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 font-mono text-xs text-subtle tabular-nums",
				children: [
					turn.exitCode === null ? "без кода" : `код ${turn.exitCode}`,
					" · ",
					(turn.durationMs / 1e3).toFixed(1),
					" с"
				]
			}) : null
		]
	});
}
function SitePanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Серверы"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "Не в коде агента, а в inventory. Демо-набор."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 flex flex-col",
				children: SERVERS.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "border-t border-line py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-sm",
								children: server.id
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs text-subtle",
								children: server.type
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: server.roles.join(" · ")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-subtle",
							children: server.note
						})
					]
				}, server.id))
			})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-sm font-medium",
			children: "Runbooks"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2",
			children: RUNBOOKS.map((book) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "border-t border-line",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", {
					className: "flex min-h-11 items-center justify-between gap-3 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm",
						children: book.title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RiskBadge, { risk: book.risk })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-1 pb-3 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-pretty",
							children: book.description
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Входы: ", book.inputs] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Проверка: ", book.validation] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Цели: ", book.targets] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Исполнитель: ", book.executor] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Таймаут: ", book.timeout] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Откат: ", book.rollback] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Верификация: ", book.verification] })
					]
				})]
			}, book.id))
		})] })]
	});
}
function AuditPanel() {
	const audit = useJarvis((state) => state.audit);
	if (audit.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted",
		children: "Журнал пуст. Каждая команда оставит след без секретов."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "flex flex-col gap-3",
		children: audit.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "rounded-lg border border-line bg-bg p-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-xs text-moss",
						children: entry.result
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-xs text-subtle tabular-nums",
						children: formatClock(entry.at)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-pretty",
					children: entry.request
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2 font-mono text-xs text-subtle",
					children: [
						entry.user,
						" · ",
						entry.source,
						" · ",
						entry.intent
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-mono text-xs text-subtle",
					children: [
						entry.tool,
						" · ",
						entry.target,
						" · L",
						entry.risk
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs break-all text-subtle",
					children: entry.parameters
				}),
				entry.approvalId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-warn",
					children: entry.approvalId
				}) : null,
				entry.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-danger",
					children: entry.error
				}) : null
			]
		}, entry.id))
	});
}
function AccessPanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Уровни"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "mt-3 flex flex-col gap-2 text-sm text-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L0 чтение — сразу. Логи, место, CI, маршруты." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L1 низкий — сразу. Backup по шаблону." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L2 изменение — фраза CONFIRM и номер заявки, 5 минут." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "L3 критический — две фразы. Ребут DC, firewall, удаление." })
				]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Учётки"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Одной всемогущей записи нет. Паролей в консоли нет."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 flex flex-col gap-2",
					children: ACCOUNTS.map((account) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-sm",
						children: account.id
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: account.scope
					})] }, account.id))
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-sm font-medium",
					children: "Контур"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 flex flex-col gap-2",
					children: SERVICES.map((service) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: service.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-xs text-subtle",
							children: service.state
						})]
					}, service.name))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-pretty text-sm text-muted",
					children: "Это модель. PostgreSQL, Redis, Whisper и Semaphore здесь не запущены и к вашей сети не подключены."
				})
			] })
		]
	});
}
function Side({ tab }) {
	if (tab === "audit") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuditPanel, {});
	if (tab === "access") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccessPanel, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SitePanel, {});
}
var SIDE = [
	{
		id: "site",
		label: "Среда"
	},
	{
		id: "audit",
		label: "Журнал"
	},
	{
		id: "access",
		label: "Доступ"
	}
];
function Console() {
	const turns = useJarvis((state) => state.turns);
	const now = useJarvis((state) => state.now);
	const busy = useJarvis((state) => state.busy);
	const dryRun = useJarvis((state) => state.dryRun);
	const operatorId = useJarvis((state) => state.operatorId);
	const setDryRun = useJarvis((state) => state.setDryRun);
	const setOperator = useJarvis((state) => state.setOperator);
	const submit = useJarvis((state) => state.submit);
	const tick = useJarvis((state) => state.tick);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [voiceOpen, setVoiceOpen] = (0, import_react.useState)(false);
	const [hearing, setHearing] = (0, import_react.useState)(null);
	const [listening, setListening] = (0, import_react.useState)(false);
	const [live, setLive] = (0, import_react.useState)("");
	const [voiceNote, setVoiceNote] = (0, import_react.useState)(null);
	const [review, setReview] = (0, import_react.useState)(null);
	const [mobile, setMobile] = (0, import_react.useState)("dialog");
	const [panel, setPanel] = (0, import_react.useState)("site");
	const endRef = (0, import_react.useRef)(null);
	const recRef = (0, import_react.useRef)(null);
	const pendingRef = (0, import_react.useRef)("");
	const cancelRef = (0, import_react.useRef)(false);
	const voiceBusy = (0, import_react.useRef)(false);
	const silenceRef = (0, import_react.useRef)(null);
	const limitRef = (0, import_react.useRef)(null);
	const candidatesRef = (0, import_react.useRef)([]);
	const locked = busy || hearing !== null || listening;
	const stranger = operatorId !== "admin1";
	(0, import_react.useEffect)(() => {
		const id = window.setInterval(() => tick(Date.now()), 1e3);
		return () => window.clearInterval(id);
	}, [tick]);
	(0, import_react.useEffect)(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [turns, hearing]);
	(0, import_react.useEffect)(() => {
		return () => {
			cancelRef.current = true;
			if (silenceRef.current) window.clearTimeout(silenceRef.current);
			if (limitRef.current) window.clearTimeout(limitRef.current);
			recRef.current?.abort();
		};
	}, []);
	async function send(text, source) {
		const value = text.trim();
		if (!value || locked) return;
		if (source === "text") setDraft("");
		await submit(value, source);
	}
	function clearListenTimers() {
		if (silenceRef.current) window.clearTimeout(silenceRef.current);
		if (limitRef.current) window.clearTimeout(limitRef.current);
		silenceRef.current = null;
		limitRef.current = null;
	}
	async function acceptVoice(text, heard) {
		const value = text.trim();
		if (!value || voiceBusy.current) return;
		voiceBusy.current = true;
		setVoiceOpen(false);
		setLive("");
		setVoiceNote(null);
		setReview(null);
		setMobile("dialog");
		setHearing(value);
		try {
			await sleep(700);
			setHearing(null);
			await submit(value, "voice", heard);
		} finally {
			voiceBusy.current = false;
		}
	}
	function settleVoice() {
		const awaiting = useJarvis.getState().turns.some((item) => item.phase === "awaiting");
		const alts = candidatesRef.current.length ? candidatesRef.current : pendingRef.current ? [{
			transcript: pendingRef.current,
			confidence: 1
		}] : [];
		candidatesRef.current = [];
		pendingRef.current = "";
		if (!alts.length) {
			setVoiceNote("no-speech");
			return;
		}
		if (awaiting) {
			acceptVoice(alts[0].transcript);
			return;
		}
		const reading = interpretSpeech(alts);
		if (!reading.text) {
			setVoiceNote("no-speech");
			return;
		}
		if (reading.uncertain) {
			setReview(reading);
			setLive(reading.raw);
			return;
		}
		acceptVoice(reading.text, reading.raw);
	}
	function beginVoice() {
		if (busy || hearing || voiceBusy.current) return;
		const previous = recRef.current;
		recRef.current = null;
		if (previous) {
			previous.onresult = null;
			previous.onerror = null;
			previous.onend = null;
			previous.abort();
		}
		cancelRef.current = false;
		pendingRef.current = "";
		candidatesRef.current = [];
		clearListenTimers();
		setLive("");
		setVoiceNote(null);
		setReview(null);
		setVoiceOpen(true);
		setMobile("dialog");
		const rec = createRecognizer();
		if (!rec) {
			setListening(false);
			setVoiceNote("unsupported");
			return;
		}
		recRef.current = rec;
		setListening(true);
		rec.onresult = (event) => {
			const alts = alternativesFrom(event.results);
			if (!alts.length) return;
			candidatesRef.current = alts;
			pendingRef.current = alts[0].transcript;
			setLive(alts[0].transcript);
			if (silenceRef.current) window.clearTimeout(silenceRef.current);
			silenceRef.current = window.setTimeout(() => {
				silenceRef.current = null;
				recRef.current?.stop();
			}, 900);
		};
		rec.onerror = (event) => {
			if (event.error === "aborted" || event.error === "no-speech") return;
			cancelRef.current = true;
			setListening(false);
			setVoiceNote(event.error);
		};
		rec.onend = () => {
			clearListenTimers();
			setListening(false);
			recRef.current = null;
			if (cancelRef.current) {
				cancelRef.current = false;
				return;
			}
			settleVoice();
		};
		try {
			rec.start();
			limitRef.current = window.setTimeout(() => {
				limitRef.current = null;
				recRef.current?.stop();
			}, 12e3);
		} catch {
			setListening(false);
			recRef.current = null;
			setVoiceNote("audio-capture");
		}
	}
	function finishVoice() {
		clearListenTimers();
		const rec = recRef.current;
		if (!rec) {
			settleVoice();
			return;
		}
		rec.stop();
	}
	function cancelVoice() {
		cancelRef.current = true;
		pendingRef.current = "";
		candidatesRef.current = [];
		clearListenTimers();
		const rec = recRef.current;
		recRef.current = null;
		if (rec) {
			rec.onresult = null;
			rec.onerror = null;
			rec.onend = null;
			rec.abort();
		}
		setListening(false);
		setVoiceOpen(false);
		setLive("");
		setVoiceNote(null);
		setReview(null);
	}
	const reading = live ? interpretSpeech([{
		transcript: live,
		confidence: 1
	}]) : null;
	const recognized = Boolean(reading && reading.changed && !reading.uncertain && reading.text);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "border-b border-line",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3 px-4 pt-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs text-moss",
							children: "демо-консоль"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-xl font-semibold tracking-tight",
							children: "JARVIS"
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": dryRun,
							onClick: () => setDryRun(!dryRun),
							className: "min-h-11 rounded-md px-3 font-mono text-xs " + (dryRun ? "bg-forest text-paper" : "bg-paper text-ink"),
							children: dryRun ? "DRY RUN" : "Боевой"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex gap-2 px-4 py-3",
						children: OPERATORS.map((operator) => {
							const active = operator.id === operatorId;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setOperator(operator.id),
								className: "min-h-11 flex-1 rounded-md border text-sm " + (active ? "border-paper bg-paper text-ink" : "border-line text-muted"),
								children: operator.id === "admin1" ? "admin1" : "чужой ID"
							}, operator.id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-4 pb-3 font-mono text-xs text-subtle",
						children: "Telegram → Whisper → ядро → политика → инструмент"
					})
				]
			}),
			stranger ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-line px-4 py-2 text-sm text-danger",
				children: "Этот Telegram ID не в allowlist. Команды будут отклонены."
			}) : null,
			!dryRun ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-b border-line bg-forest px-4 py-2 text-sm text-paper",
				children: "Боевой режим здесь тоже симуляция: серверы компании не вызываются."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-0 flex-1 flex-col lg:flex-row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: `${mobile === "dialog" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col lg:flex`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4",
						"aria-live": "polite",
						children: [
							turns.length === 0 && !hearing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "max-w-xl text-pretty text-muted",
									children: "Нажмите микрофон и скажите команду. Если записи нет, те же фразы можно отправить текстом. Намерение выбирает контур, инструмент берётся из runbook."
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex flex-col gap-2",
									children: VOICE_PRESETS.slice(0, 3).map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void send(preset.text.replace(/^Джарвис, /, ""), "text"),
										className: "min-h-11 rounded-lg border border-line px-3 text-left text-sm",
										children: preset.text
									}, preset.id))
								})]
							}) : null,
							turns.map((turn) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "ml-8 rounded-lg bg-elevated px-3 py-2",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "font-mono text-xs text-subtle",
											children: [
												turn.source === "voice" ? "голос" : "текст",
												" · ",
												formatClock(turn.at)
											]
										}),
										turn.heard ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "text-xs text-subtle",
											children: ["услышано: ", turn.heard]
										}) : null,
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-pretty text-sm",
											children: turn.request
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TurnCard, {
									turn,
									now
								})]
							}, turn.id)),
							hearing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "turn-in rounded-xl border border-line bg-surface p-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "font-mono text-xs text-moss",
										children: "Whisper"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wave, {})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-3 text-pretty text-sm text-muted",
										children: hearing
									})
								]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: endRef })
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "border-t border-line p-3",
						onSubmit: (event) => {
							event.preventDefault();
							send(draft, "text");
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex gap-2 overflow-x-auto pb-2",
							children: SUGGESTIONS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: locked,
								onClick: () => void send(item.text, "text"),
								className: "min-h-11 shrink-0 rounded-full border border-line px-3 text-sm text-muted disabled:opacity-40",
								children: item.label
							}, item.label))
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: draft,
									onChange: (event) => setDraft(event.target.value),
									disabled: locked,
									placeholder: "Команда или фраза CONFIRM…",
									"aria-label": "Команда",
									className: "min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg disabled:opacity-40"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": listening ? "Остановить запись" : "Голосовая команда",
									"aria-pressed": listening,
									disabled: busy || hearing !== null,
									onClick: () => listening ? finishVoice() : beginVoice(),
									className: "flex size-11 items-center justify-center rounded-md disabled:opacity-40 " + (listening ? "bg-forest text-paper" : "border border-line"),
									children: listening ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, {
										className: "size-4",
										"aria-hidden": "true"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, {
										className: "size-5",
										"aria-hidden": "true"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "submit",
									"aria-label": "Отправить",
									disabled: locked || draft.trim() === "",
									className: "flex size-11 items-center justify-center rounded-md bg-paper text-ink disabled:opacity-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, {
										className: "size-5",
										"aria-hidden": "true"
									})
								})
							]
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: `${mobile === "dialog" ? "hidden" : "flex"} min-h-0 w-full flex-col border-line lg:flex lg:w-96 lg:border-l`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "hidden gap-2 px-4 pt-3 lg:flex",
						children: SIDE.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setPanel(item.id),
							className: "min-h-11 flex-1 rounded-md text-sm " + (panel === item.id ? "bg-paper text-ink" : "text-muted"),
							children: item.label
						}, item.id))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "min-h-0 flex-1 overflow-y-auto px-4 py-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Side, { tab: mobile === "dialog" ? panel : mobile })
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				className: "grid grid-cols-4 border-t border-line lg:hidden",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Диалог",
						active: mobile === "dialog",
						onClick: () => setMobile("dialog"),
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Среда",
						active: mobile === "site",
						onClick: () => {
							setPanel("site");
							setMobile("site");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Server, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Журнал",
						active: mobile === "audit",
						onClick: () => {
							setPanel("audit");
							setMobile("audit");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollText, {
							className: "size-5",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
						label: "Доступ",
						active: mobile === "access",
						onClick: () => {
							setPanel("access");
							setMobile("access");
						},
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyRound, {
							className: "size-5",
							"aria-hidden": "true"
						})
					})
				]
			}),
			voiceOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-20 flex items-end bg-ink/80",
				onClick: cancelVoice,
				role: "presentation",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					role: "dialog",
					"aria-label": "Голосовая команда",
					className: "max-h-full w-full overflow-y-auto rounded-t-xl border border-line bg-surface p-4",
					onClick: (event) => event.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-lg font-semibold tracking-tight",
								children: listening ? "Слушаю" : "Голос"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-pretty text-sm text-muted",
								children: "Говорите целиком и сделайте короткую паузу. Похожие слова сверяю со списком команд, опасные не угадываю."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "Закрыть",
								onClick: cancelVoice,
								className: "flex size-11 items-center justify-center",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
									className: "size-5",
									"aria-hidden": "true"
								})
							})]
						}),
						listening || live ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4",
							"aria-live": "polite",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wave, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 min-h-6 text-pretty text-sm",
									children: live || "Говорите"
								}),
								recognized && reading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-sm text-moss",
									children: ["разбор: ", reading.text]
								}) : null
							]
						}) : null,
						voiceNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-pretty text-sm text-warn",
							children: voiceNoteText(voiceNote)
						}) : null,
						review?.uncertain ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-pretty text-sm",
								children: [
									"Услышал «",
									review.raw,
									"». Уточните команду."
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 flex flex-col gap-2",
								children: [review.choices.map((choice) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void acceptVoice(choice.text, review.raw),
									className: "min-h-11 rounded-md border border-line px-3 text-left text-sm",
									children: choice.label
								}, choice.text)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void acceptVoice(review.raw),
									className: "min-h-11 px-3 text-left text-sm text-muted",
									children: "Оставить как услышано"
								})]
							})]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex flex-wrap gap-2",
							children: [listening ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: finishVoice,
								className: "min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink",
								children: "Готово"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: beginVoice,
								className: "min-h-11 rounded-md bg-paper px-3 text-sm font-medium text-ink",
								children: voiceNote ? "Повторить" : "Слушать"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: cancelVoice,
								className: "min-h-11 rounded-md px-3 text-sm text-muted",
								children: "Отмена"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-sm text-subtle",
							children: "Или пример фразы"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 flex flex-col gap-2",
							children: VOICE_PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => {
									clearListenTimers();
									const rec = recRef.current;
									recRef.current = null;
									if (rec) {
										rec.onresult = null;
										rec.onerror = null;
										rec.onend = null;
										rec.abort();
									}
									setListening(false);
									acceptVoice(preset.text);
								},
								className: "flex min-h-11 items-center justify-between gap-3 rounded-md border border-line px-3 text-left text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-pretty",
									children: preset.text
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-xs text-subtle tabular-nums",
									children: preset.length
								})]
							}, preset.id))
						})
					]
				})
			}) : null
		]
	});
}
function NavButton({ label, active, onClick, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: `flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "text-paper" : "text-subtle"}`,
		children: [icon, label]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Console, {});
}
//#endregion
export { Home as component };
