# Память

Системная запись остаётся append-only `memory.jsonl` под `withStateLock`. Второй несогласованный store не включается.

Запись несёт kind (`conversation`, `infrastructure`, `incident`, `procedure`, `development`, `preference`), время, источник, видимость `viewer|operator|admin`, уверенность `observed|hypothesis|confirmed`, систему и срок. Источник `llm:` или `model:` не может записать `confirmed`: ответ `UNCONFIRMED`. Секреты и критические инфраструктурные факты по-прежнему отклоняются. Критический факт не обновляет inventory.

Поиск: ключевые слова, фильтры kind/system/даты, роль читателя. Без `readerRole` поведение старых вызовов сохраняется. `hybridSearch` добавляет cosine только к переданным векторам; отсутствие эмбеддингов не подменяется случайными числами.

`forgetMemory`, `redactMemory` и `purgeExpiredMemory` меняют файл атомарно. `importMemoryRows` показывает параметризованную проекцию в Postgres. Схема `migrations/optional/0003_jarvis_memory.sql` не применяется PGLite и не создаёт `pgvector`.
