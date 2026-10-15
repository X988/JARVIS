> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `subsystem-info`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Анализ структуры подсистемы 1С из XML-выгрузки — состав, дочерние подсистемы, командный интерфейс, дерево иерархии. Используй для изучения структуры подсистем и навигации по конфигурации


# /subsystem-info — Структура подсистемы 1С

Читает XML подсистемы из выгрузки конфигурации 1С и выводит компактное описание структуры.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `SubsystemPath` | Путь к XML-файлу подсистемы, каталогу подсистемы или каталогу `Subsystems/` (для tree) |
| `Mode` | Режим: `overview` (default), `content`, `ci`, `tree`, `full` |
| `Name` | Drill-down: тип объекта в content, секция в ci, имя подсистемы в tree |
| `Limit` / `Offset` | Пагинация (по умолчанию 150 строк) |
| `OutFile` | Записать результат в файл (UTF-8 BOM) |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Пять режимов

| Режим | Что показывает |
|---|---|
| `overview` *(default)* | Компактная сводка: свойства, состав (сгруппирован по типам), дочерние подсистемы, наличие CI |
| `content` | Список Content с группировкой по типу объекта. `-Name Catalog` — только каталоги |
| `ci` | Разбор CommandInterface.xml: видимость, размещение, порядок команд/подсистем/групп |
| `tree` | Рекурсивное дерево иерархии подсистем с маркерами [CI], [OneCmd], [Скрыт] |
| `full` | Полная сводка: overview + content + ci в одном вызове |

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
