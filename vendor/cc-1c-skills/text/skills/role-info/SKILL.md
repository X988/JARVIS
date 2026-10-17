> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `role-info`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Компактная сводка прав роли 1С из Rights.xml — объекты, права, RLS, шаблоны ограничений. Используй для аудита прав — какие объекты и действия доступны, ограничения RLS


# /role-info — анализ роли 1С

Парсит `Rights.xml` роли и выдаёт компактную сводку: объекты сгруппированы по типу, показаны только разрешённые права. Сжатие: тысячи строк XML → 50–150 строк текста.

## Использование

```
/role-info <RightsPath>
```

**RightsPath** — путь к файлу `Rights.xml` роли (обычно `Roles/ИмяРоли/Ext/Rights.xml`).

## Запуск скрипта

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-RightsPath` | да | Путь к Rights.xml |
| `-ShowDenied` | нет | Показать запрещённые права (по умолчанию скрыты) |
| `-Limit` | нет | Макс. строк вывода (по умолчанию `150`). `0` = без ограничений |
| `-Offset` | нет | Пропустить N строк — для пагинации (по умолчанию `0`) |
| `-OutFile` | нет | Записать результат в файл (UTF-8 BOM). Без этого — вывод в консоль |

**Важно:** Всегда используй `-OutFile` и читай результат через Read tool. Прямой вывод в консоль через bash ломает кириллицу.

Для большой роли при усечении вывода:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
