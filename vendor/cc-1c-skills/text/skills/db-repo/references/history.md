> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-repo`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# История версий хранилища

## report — отчёт по версиям

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `-OutputFile <путь>` | Куда сохранить отчёт. Необязателен |
| `-NBegin <номер>` | С какой версии. `-1` — только последняя |
| `-NEnd <номер>` | По какую версию |
| `-DateBegin` / `-DateEnd` | Границы по датам |
| `-GroupByObject` | Группировать по объектам |
| `-GroupByComment` | Группировать по комментарию |
| `-ReportFormat <txt\|mxl>` | По умолчанию `txt` |

`txt` — с разделителем-табуляцией, разбирается построчно.

> На боевом хранилище полный отчёт строить не надо — тысячи версий. Нужна головная
> версия — `-NBegin -1`. Длинный отчёт в вывод не печатается: сузьте выборку
> параметрами ниже.

## dump-cfg — выгрузить версию в CF

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Без `-Version` (или при `-1`) выгружается последняя версия.
