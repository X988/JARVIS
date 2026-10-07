# Backup и disaster recovery

## Сам JARVIS

Текущий filesystem state находится в `JARVIS_STATE_DIR` (по умолчанию `data/`) и включает security/audit state. Backup должен выполняться только после согласованной остановки процесса либо средствами snapshot, которые дают согласованную копию.

Проверяемая процедура восстановления:

1. Подготовить чистую машину/каталог с той же поддерживаемой версией Node.js.
2. Checkout проверенного release/commit, затем `npm ci`.
3. Восстановить state/database backup с исходными правами доступа.
4. Выполнить `npm run db:migrate`.
5. Проверить локальную audit hash-chain через `verifyAudit()`.
6. Запустить приложение.
7. Проверить `/health`.
8. Проверить `/ready`: production-профиль не считается ready, пока обязательные live probes не имеют свежий `HEALTHY`.
9. Выполнить функциональный smoke read-only runbook через обычный authenticated pipeline.
10. Проверить внешний audit sink и backlog.

Автоматизированного clean-machine restore-test в CI пока нет. Поэтому JARVIS backup следует считать **IMPLEMENTED PROCEDURE / NOT LIVE VERIFIED**, а не production-verified DR.

## SQL Server

SQL adapter реализован. `sql.backup` не принимает произвольное имя базы или путь от клиента: database берётся из inventory, destination — из server configuration `JARVIS_SQL_BACKUP_DIR`.

Успех SQL backup требует всей цепочки:

```text
database ONLINE
→ no active BACKUP/RESTORE conflict
→ BACKUP DATABASE ... WITH CHECKSUM
→ RESTORE HEADERONLY
→ RESTORE VERIFYONLY ... WITH CHECKSUM
→ OK
```

Если любой этап не подтверждён, adapter не возвращает `OK`.

Пробное полное восстановление должно выполняться только в одноразовую тестовую базу/изолированный SQL instance, никогда поверх `utp`. В этом репозитории live restore в чистый SQL Server не выполнялся, поэтому SQL backup workflow является **IMPLEMENTED / TESTED IN CODE / NOT LIVE VERIFIED** до проверки на вашей инфраструктуре.

## Trust boundary

Локальный backup и локальная audit hash-chain не защищают от владельца диска. Для production нужен отдельный защищённый backup destination и внешний append-only audit sink как независимый trust anchor.
