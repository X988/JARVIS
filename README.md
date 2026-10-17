# Corporate JARVIS Infrastructure & Development Control Plane

Корпоративный JARVIS для системного администратора, DevOps-инженера и разработчика 1С.

Проект объединяет web/PWA, Telegram, voice-first управление, memory, scheduler, background/coding workers, RAG, MCP/plugins и инфраструктурные adapters, но сохраняет строгую серверную модель безопасности.

> **Статус:** active development / pre-production.  
> Проект нельзя считать production-ready, пока реальные adapters, credentials, integration tests и эксплуатационные сценарии не подтверждены на целевой инфраструктуре.

## Главный принцип

JARVIS не использует модель:

```text
LLM → arbitrary shell → production host
```

Основной контур:

```text
Client
  → Authentication
  → STT
  → Intent
  → Constraints
  → Inventory
  → Policy Engine
  → Runbook Registry
  → Approval Engine
  → Execution Gateway
  → Executor
  → Verification
  → Audit
```

LLM, Telegram, plugin, MCP tool, worker или UI не могут напрямую вызвать production executor в обход Gateway.

## Ключевые возможности

### Control plane

- server-side authentication and authorization;
- inventory как source of truth;
- Policy Engine;
- Runbook Registry;
- Approval Engine с TTL, actor binding и parameter hash;
- `DENY_ALWAYS` для необратимых/запрещённых действий;
- idempotency;
- locks;
- rate limiting;
- verification после execution;
- append-only audit с hash chain;
- durable outbox для внешнего HTTP/Loki audit sink.

### Telegram

- numeric Telegram User ID authorization;
- text messages;
- voice messages;
- documents/images как untrusted attachments;
- reply/forward context;
- typing/progress action;
- text response;
- optional TTS voice response;
- artifact delivery с path jail, size limit и secret scanning.

Telegram является только клиентом. Он не принимает security-решения.

### Voice

- faster-whisper;
- optional whisper.cpp-compatible wrapper;
- русский язык;
- Silero VAD в STT pipeline;
- domain prompt;
- confidence gate;
- language-confidence gate;
- normalization инфраструктурных терминов: UTP, Mailcow, MikroTik, WireGuard, SQL, 1С и др.;
- optional Piper TTS;
- natural sentence clipping;
- configurable speech pace/pause;
- barge-in primitives;
- optional wake-word feature flag.

Voice input не является authentication или approval factor.

### Persistent state

- conversation/infrastructure/incident/procedural/development memory;
- memory search;
- persistent scheduler;
- recurring/cron-like tasks;
- timezone support через IANA zones;
- task history;
- worker/job state;
- cancellation;
- incident lifecycle;
- audit state.

Critical inventory facts не должны изменяться через memory автоматически.

Filesystem state имеет bounded lifecycle: rate-limit buckets, timestamped idempotency results, expired approvals, terminal worker jobs, execution metadata, Telegram inbound attachments и stale clean worktrees ограничиваются retention/cap настройками. Активные jobs и dirty worktrees автоматически не удаляются. Недоставленный audit outbox по возрасту не выбрасывается.

### Coding workflow

- isolated Git worktrees;
- branch-per-task;
- test/lint/typecheck/diff workflow;
- PR/CI watcher;
- worker terminal states;
- direct push в `main/master` запрещён;
- worker не имеет права самостоятельно merge/deploy production.

### RAG / research / MCP / plugins

- local knowledge-base indexing;
- Markdown/TXT/JSON/YAML/CSV/code/BSL/PowerShell/SQL;
- source metadata;
- secret-bearing content исключается из RAG ingestion;
- MCP discovery отделён от execution authority;
- MCP execution только через зарегистрированный runbook + target + Gateway;
- schema-validated plugins;
- plugin permissions allowlist;
- plugin manifest validation;
- browser workbench только для allowlisted read-only HTTP(S) целей.

### Infrastructure adapters

Реализованы или подготовлены безопасные adapters для:

- Windows / WinRM / PowerShell fixed probes;
- Linux / SSH fixed probes;
- SQL Server;
- Mailcow;
- MikroTik RouterOS REST API;
- WireGuard status;
- 1С file export;
- monitoring: Prometheus, Zabbix, Alertmanager.

Readiness не выполняет live production probes автоматически: configured и verified — разные состояния.

## 1С Developer subsystem

Development/test-only контур поддерживает:

- поиск объектов в file export;
- чтение BSL;
- bounded BSL source search;
- static BSL checks;
- query analysis;
- безопасную запись BSL в development/test export;
- rollback файла при validation failure;
- metadata skeleton creation;
- Git-oriented workflow;
- запрет production write;
- symlink/path traversal protection.

Validation levels:

```text
FALLBACK_ONLY
BSL_LANGUAGE_SERVER
DESIGNER_CHECK
TEST_DATABASE_VERIFIED
```

Внешние validators подключаются только через фиксированные wrapper executables. Произвольная shell-строка не используется.

Production upload/CF load и динамический `Выполнить()` остаются запрещёнными.

## SQL backup

`sql.backup` использует серверные параметры и inventory.

Текущий workflow включает:

- проверку database mapping;
- SQL connection;
- configurable timeouts;
- `BACKUP DATABASE ... WITH CHECKSUM`;
- `RESTORE VERIFYONLY ... WITH CHECKSUM`;
- verification result;
- audit.

Backup target не берётся из произвольного client input.

## Security boundaries

Некоторые действия запрещены независимо от approval:

- production database drop;
- arbitrary production shell;
- direct push в `main/master`;
- `onec.exec`;
- uncontrolled production 1С load;
- динамический `Выполнить()`;
- forged approval/risk/runbook/target;
- unknown plugin/MCP tool;
- monitoring self-heal без явного policy и registered runbook.

Client-supplied security fields считаются недоверенными.

## Единый серверный контур

Текст консоли, браузерный голос и Telegram используют серверные маршруты
`/api/agent` и `/api/commands`. Выбор demo-оператора не даёт полномочий.
Legacy SSH/MikroTik ToolEngine не подключён к web API: отдельное `live`
исполнение отключено. Для адаптеров действует только `EXECUTION_MODE=real`,
после server-side policy и approval. `/admin/audit` читает проверенную цепочку
аудита и доступен только роли `admin` из серверной карты пользователей.

Результаты проверки всех веток: [аудит 2026-10-14](docs/BRANCH_AUDIT_2026-10-14.md).

## AI agent runtime

В ветке `jarvis/prod-contour` добавлен отдельный bounded AI-agent контур:

```text
User
  → LLM Planner
  → JSON Schema validation
  → Tool Registry
  → Inventory admission
  → Policy / risk check
  → read-only Gateway
  → Executor
  → Verification + Audit
  → grounded response
```

Поддерживаются LLM providers:

- OpenAI Responses API;
- Anthropic Messages API;
- Gemini API;
- локальный Ollama.

AI-agent выключен по умолчанию и включается только через:

```env
JARVIS_AI_AGENT_ENABLED=1
```

Endpoint:

```text
POST /api/agent
```

`/api/agent` работает как hybrid endpoint: известные команды сначала идут в детерминированный command pipeline; LLM используется для свободных запросов, которые старый intent classifier не распознал. Если AI предлагает изменение, модель не создаёт approval сама — исходный текст независимо повторно проверяется command pipeline.

При `JARVIS_AI_AGENT_ENABLED=1` тот же hybrid routing используется для **текстовых** сообщений Telegram и для кнопки «голосовой разговор» в браузере (`POST /api/voice`). Голосовой Telegram-контур пока остаётся на существующем deterministic STT → `processCommand` пути. Браузерный разговор не подтверждает заявки голосом.

Критическая граница текущей реализации: автономный agent loop может исполнять только зарегистрированные `risk=0`, `mutates=false`, `policy=ALLOW` runbooks. Любой mutating runbook останавливается с `MUTATION_REQUIRES_APPROVAL` и не передаётся executor. Изменения инфраструктуры продолжают проходить через обычный Approval Engine и command pipeline.

LLM не является источником полномочий: tool, target, risk, policy и execution authority повторно выводятся и проверяются на сервере. API keys не включаются в prompt; ответы executor перед отправкой в optional sensitive-model synthesis проходят redaction.

## Четыре аналитические роли (opt-in)

Экспериментальный аналитический слой работает поверх существующего `/api/agent`,
не заменяя Inventory, Policy, Runbooks, Approvals, Gateway и Audit.

- `coordinator` — формулирует диагностическую цель и недостающие данные;
- `context-manager` — выделяет существенные наблюдения и противоречия;
- `root-cause-analyst` — оценивает альтернативные объяснения;
- `reviewer` — проверяет вывод и ссылки на подтверждённые наблюдения.

По умолчанию **выключен**. Включается только явно через
`JARVIS_ANALYST_TEAM_ENABLED=1` вместе с `JARVIS_AI_AGENT_ENABLED=1`.
Команда запускается лишь после успешного read-only Gateway с audit ID,
не запускается для MOCK, DRY_RUN или отклонённых изменений. Четыре
модельных вызова могут повышать стоимость и задержку. При ошибке любой
роли вывод возвращается к серверному отчёту по наблюдениям; успешный
результат команды без подтверждённых evidence IDs запрещён.

Инструкции, испытания и критерии расширения: [Analyst team](docs/ANALYST_TEAM.md).

## Технологии

- TypeScript;
- React 19;
- TanStack Start / Router / Query;
- Vite;
- Node.js 22;
- Tailwind CSS;
- Better Auth;
- PostgreSQL / PGlite fallback;
- Playwright;
- Node test runner;
- Zod;
- SQL Server via `tedious`.

## Быстрый старт

Требования:

- Node.js 22;
- npm;
- для voice-тестов — `ffmpeg`;
- для production STT — Python + faster-whisper либо configured whisper.cpp wrapper;
- для local TTS — Piper + локальная voice model.

Установка:

```bash
git clone <repository>
cd JARVIS
npm ci
cp .env.example .env
npm run dev
```

Dev server по умолчанию запускается на:

```text
http://localhost:8080
```

По умолчанию execution mode:

```env
EXECUTION_MODE=dry-run
```

Не включайте `real`, пока adapters, inventory, credentials и policy не настроены и не протестированы.

## Локальный вход на LAN

Страница `/login` принимает почту и пароль через Better Auth. Кнопки Google и X остаются для брокера Grok и на сервере без него не нужны.

Регистрация **не** делает человека оператором. Пока Better Auth user id нет в `JARVIS_WEB_ACTORS_JSON`, консоль отвечает `ACTOR_DENIED`. Права по-прежнему задаёт только эта карта (и Telegram-карта для бота).

Сессия — cookie с префиксом `__Host-` и флагом `Secure`. Открывайте JARVIS по HTTPS (как Caddy на `https://192.168.0.184:9443`). По голому HTTP на LAN-IP браузер cookie не сохранит.

Пример для systemd / окружения процесса. Порт dev-сервера может быть своим (`127.0.0.1:8095`); публичный адрес — тот, что в браузере.

```env
VITE_AUTH_ENABLED=true
BETTER_AUTH_URL=https://192.168.0.184:9443
BETTER_AUTH_SECRET=<openssl rand -hex 32>
JARVIS_PGLITE_DIR=./data/pglite
JARVIS_EMAIL_SIGNUP=1
EXECUTION_MODE=dry-run
```

`VITE_AUTH_ENABLED=false` в `.grok/app-env.json` выключает сессии: процессное окружение перекрывает файл, если запускаете через `npm run dev`. Без `DATABASE_URL` учётки лежат в PGLite. Без `JARVIS_PGLITE_DIR` база в памяти и пропадает при перезапуске. `BETTER_AUTH_SECRET` тоже должен быть постоянным, иначе cookie после рестарта недействительны (учётки при этом остаются).

Caddy по умолчанию передаёт `X-Forwarded-Proto` и `X-Forwarded-Host`. `BETTER_AUTH_URL` должен совпадать с origin в адресной строке, включая `https` и порт, без пути. Дополнительные origin (имя и IP) перечисляют через запятую в `BETTER_AUTH_TRUSTED_ORIGINS`. IP Vite пропускает сам. Для DNS-имени задайте `JARVIS_ALLOWED_HOSTS=jarvis.lan` (или `*`).

Порядок для первого администратора:

1. Запустите процесс с переменными выше и откройте `/login`.
2. Зарегистрируйтесь. После входа консоль покажет `ACTOR_DENIED` и Better Auth user id.
3. Вставьте карту и перезапустите:

```env
JARVIS_WEB_ACTORS_JSON={"<user-id>":{"actorId":"admin1","role":"operator"}}
```

`actorId` — имя в журнале JARVIS, не id из Better Auth. `role` для консоли должен быть `operator`.

Тот же id можно снять скриптом `npm run users:web`. Postgres (`DATABASE_URL`) читается, пока сервер работает. Каталог PGLite тоже, если файл не занят; если скрипт не открывает его, остановите JARVIS и повторите. In-memory базу скрипт не видит.

```bash
npm run users:web
```

4. Закройте регистрацию, чтобы произвольный клиент LAN не создавал учётки, и снова перезапустите:

```env
JARVIS_EMAIL_SIGNUP=0
```

Уже созданные учётки входят как раньше. Новая учётка без строки в `JARVIS_WEB_ACTORS_JSON` по-прежнему получает `ACTOR_DENIED`.

Схема Better Auth применяется из `migrations/0001_auth.sql` (копия `migrations/auth/0001_auth.sql`) и на PGLite, и на Postgres.

## Переменные окружения

Полный список находится в:

```text
.env.example
config/jarvis/env.schema.json
```

Основные группы:

- `VITE_AUTH_ENABLED`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `JARVIS_EMAIL_SIGNUP`, `JARVIS_PGLITE_DIR`;
- `JARVIS_WEB_ACTORS_JSON`;
- `JARVIS_TELEGRAM_*`;
- `JARVIS_WINDOWS_*`;
- `JARVIS_SSH_*`;
- `JARVIS_SQL_*`;
- `JARVIS_MIKROTIK_*`;
- `JARVIS_DOCKER_*`;
- `JARVIS_ONEC_*`;
- `JARVIS_STT_*`;
- `JARVIS_TTS_*`;
- `JARVIS_PROMETHEUS_URL`;
- `JARVIS_ZABBIX_*`;
- `JARVIS_ALERTMANAGER_URL`;
- `JARVIS_AUDIT_*`.

Secrets должны передаваться через environment/secret store и не храниться в Git.

## Проверка качества

Основные команды:

```bash
npm run typecheck
npm run lint
npm test
npm run coverage
npm run security:secrets
npm run security:audit
npm run build
npm run db:migrate
npm run e2e
```

Сборка и миграции разделены. `npm run build` только собирает приложение. `npm run db:migrate` применяется отдельно и без `DATABASE_URL` ничего не меняет.

Linux-сервер без Grok preview:

```bash
npm ci
npm run build
npm run db:migrate
EXECUTION_MODE=dry-run npm run start:linux
```

`start:linux` слушает `0.0.0.0:8080`. Это ещё не ввод в промышленную эксплуатацию: живые SSH, RouterOS, SQL и 1С в этом блоке не проверялись.

Полная CI-проверка включает:

```text
npm ci
→ ffmpeg install
→ typecheck
→ lint
→ unit/integration tests
→ coverage baseline
→ tracked-file secret scan
→ npm audit (critical gate)
→ CycloneDX SBOM validation
→ build
→ db:migrate
→ Playwright E2E
```

GitHub Actions, используемые workflow, закреплены на проверенных immutable commit SHA. Наличие зелёного dependency gate не означает отсутствие уязвимостей более низкой тяжести: их нужно отдельно отслеживать и обновлять без `npm audit fix --force` вслепую.

PR-ветки проверяются через `pull_request`; push-CI оставлен для `main`, чтобы не запускать две одинаковые проверки на каждый commit в PR.

## Health endpoints

Доступны:

```text
/health
/ready
/metrics
```

`/ready` показывает configured/passive status компонентов и не должен инициировать произвольные production connections.

## Основная структура

```text
src/lib/jarvis/
├── server/         # pipeline, policy, approvals, adapters, inventory
├── plane/          # memory, scheduler, workers, MCP, plugins, RAG
├── voice/          # STT, VAD, normalization, TTS
├── onec/           # 1С file export and validation
├── monitoring.ts
├── audit-log.ts
└── audit-outbox.ts

config/jarvis/
├── inventory.json
└── env.schema.json

scripts/
├── jarvis_sql.mjs
├── jarvis_monitor.mjs
├── jarvis_stt.py
└── ...

docs/
└── ...
```

## Документация

- [Руководство по установке и эксплуатации (RU)](docs/INSTALLATION_GUIDE_RU.md)

- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Telegram](docs/TELEGRAM.md)
- [Voice](docs/VOICE.md)
- [STT](docs/STT.md)
- [TTS](docs/TTS.md)
- [1C test environment](docs/ONEC_TEST.md)
- [Backup](docs/BACKUP.md)
- [Third-party inspiration and licenses](docs/THIRD_PARTY_INSPIRATION.md)

## External inspiration

Архитектурные идеи изучались в:

- `jackgladowsky/jarvis`;
- `Axx33284/jarvis`;
- `yontanbe/jarvis`;
- `sukeesh/Jarvis`.

Внешний код в текущем проходе не копировался. Подробности и проверенные лицензии описаны в [docs/THIRD_PARTY_INSPIRATION.md](docs/THIRD_PARTY_INSPIRATION.md).

## Что ещё требует реальной инфраструктуры

Для честного production-status необходимо отдельно подтвердить:

- live WinRM against target Windows hosts;
- live SSH/known_hosts;
- SQL Server health/backup/VERIFYONLY;
- Mailcow live checks;
- RouterOS live checks;
- Telegram webhook с реальным bot token;
- real STT/TTS runtime;
- BSL Language Server / Designer / EDT / test DB validation;
- external audit sink delivery;
- production deployment/recovery process.

До этого проект следует считать **pre-production control plane**, а не готовой production-системой.

## Development rule

Любое изменение production-инфраструктуры должно проходить:

```text
Inventory
→ Policy
→ Runbook
→ Approval when required
→ Gateway
→ Executor
→ Verification
→ Audit
```

**Policy важнее LLM. Runbook важнее shell. Verification важнее exit code. Human approval важнее автономности для критических действий.**

