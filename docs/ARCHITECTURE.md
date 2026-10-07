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
