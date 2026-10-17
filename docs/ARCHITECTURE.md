# Архитектура

Браузер не решает, можно ли выполнить команду. Он шлёт текст и номер запроса.

```
Клиент → POST /api/commands
  → сессия (cookie HttpOnly)
  → разбор
  → ограничение
  → inventory
  → runbook из реестра
  → политика
  → заявка, если нужна
  → шлюз
  → адаптер
  → проверка
  → audit
  → ответ
```

`EXECUTION_MODE` читается только на сервере. По умолчанию `dry-run`. Кнопка в браузере режим не переключает.

Поля `risk`, `policy`, `role`, `allowed`, `runbook`, `approved` из JSON игнорируются.

Узкие adapters Windows/WinRM, Linux/SSH, SQL Server, RouterOS REST, Mailcow/Docker, GitHub CI и выгрузка 1С реализованы как server-owned executors с фиксированными операциями. Без обязательной конфигурации они отвечают `NOT_CONFIGURED`, без credentials — `CREDENTIAL_UNAVAILABLE`, а отсутствующий локальный runtime/client — `ADAPTER_DISABLED`. `CONFIGURED_UNPROBED` не является доказательством работоспособности: production readiness требует свежего `HEALTHY` live-probe для обязательных adapters. `MockExecutor` в режиме `real` не считается выполнением.

Заявки лежат в `data/approvals.json` на сервере, не в памяти вкладки. Журнал — `data/audit.jsonl` со схемой 1 и цепочкой hash. HTTP/Loki используют durable outbox с retry; syslog намеренно остаётся `ADAPTER_DISABLED`, пока нет отдельного настоящего транспорта. Локальная hash-chain не является trust anchor против владельца диска: для production нужен внешний append-only sink.

Блокировка по умолчанию `FileLockProvider`, на одном хосте. `RedisLockProvider` выбирается `JARVIS_LOCK_BACKEND=redis`. Без `JARVIS_REDIS_URL` он отвечает `NOT_CONFIGURED` и не выдаёт lock. С URL, но без живого клиента, lock тоже не выдаётся (`ADAPTER_DISABLED`), чтобы отсутствие Redis не выглядело как свободный ресурс. Для нескольких хостов нужен настоящий Redis или advisory lock Postgres.

Слежение без URL провайдера показывает `MONITORING_NOT_CONFIGURED`. `PrometheusProvider` и `ZabbixProvider` при заданном URL не рисуют метрики, пока клиент не подключён. Карточки demo — фикстуры, не телеметрия.


## State stores

Single-node mode uses explicit filesystem-backed abstractions:

- `ApprovalStore`;
- `IdempotencyStore`;
- `RateLimitStore`;
- `LockProvider`;
- `JobStore`;
- `AuditSink`;
- `ExecutionStore`.

`createFileStateStores()` creates the filesystem implementations. Execution history persists only bounded metadata and hashes the actor identifier before storage. Corrupted security state fails closed.

Redis/PostgreSQL backends are **not implemented** and therefore are not reported as available. The existing Redis lock placeholder continues to return `NOT_CONFIGURED` / `ADAPTER_DISABLED` rather than granting a lock. PostgreSQL/Redis are the intended multi-instance backends after real clients and integration tests are added.

Блок 2 (ветка `jarvis/p1-agent-intelligence`) зависит от незамёрженного Блока 1, `jarvis/p0-secure-integration` / PR #5. Новый цикл агента не открывает второй шлюз. Описание: `docs/AGENT_RUNTIME.md`, `docs/MODEL_ROUTING.md`, `docs/MEMORY_ARCHITECTURE.md`, `docs/RAG.md`, `docs/INFRASTRUCTURE_DIAGNOSTICS.md`, `docs/TASK_ENGINE.md`, `docs/AGENT_TESTING.md`.
