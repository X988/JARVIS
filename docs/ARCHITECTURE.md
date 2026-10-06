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

Живые адаптеры Windows (WinRM), SSH, SQL, RouterOS, Docker и выгрузка 1С без переменных окружения отвечают `NOT_CONFIGURED`. Если задан адрес, но нет учётной записи, ответ `CREDENTIAL_UNAVAILABLE`. Если заданы оба, а клиент в этом репозитории не подключён, ответ `ADAPTER_DISABLED`. Успех не подменяется. `MockExecutor` в режиме `real` тоже не считается выполнением.

Заявки лежат в `data/approvals.json` на сервере, не в памяти вкладки. Журнал — `data/audit.jsonl` со схемой 1 и цепочкой hash. Внешний sink (syslog, HTTP, Loki) без URL равен `NOT_CONFIGURED`. Если URL задан, а клиент доставки не подключён, статус `ADAPTER_DISABLED`. Подмена файла целиком локальной цепочкой не ловится, пока нет внешней копии.

Блокировка по умолчанию `FileLockProvider`, на одном хосте. `RedisLockProvider` выбирается `JARVIS_LOCK_BACKEND=redis`. Без `JARVIS_REDIS_URL` он отвечает `NOT_CONFIGURED` и не выдаёт lock. С URL, но без живого клиента, lock тоже не выдаётся (`ADAPTER_DISABLED`), чтобы отсутствие Redis не выглядело как свободный ресурс. Для нескольких хостов нужен настоящий Redis или advisory lock Postgres.

Слежение без URL провайдера показывает `MONITORING_NOT_CONFIGURED`. `PrometheusProvider` и `ZabbixProvider` при заданном URL не рисуют метрики, пока клиент не подключён. Карточки demo — фикстуры, не телеметрия.
