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
cd honey-granite-fair-hazel
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

## Переменные окружения

Полный список находится в:

```text
.env.example
config/jarvis/env.schema.json
```

Основные группы:

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
npm run build
npm run e2e
```

Полная CI-проверка включает:

```text
npm ci
→ ffmpeg install
→ typecheck
→ lint
→ tests
→ build
→ Playwright E2E
```

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
