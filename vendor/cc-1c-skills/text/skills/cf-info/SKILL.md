> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cf-info`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Анализ структуры конфигурации 1С — свойства, состав, счётчики объектов. Используй для обзора конфигурации — какие объекты есть, сколько их, какие настройки


# /cf-info — Структура конфигурации 1С

Читает Configuration.xml из выгрузки конфигурации и выводит компактное описание структуры.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `ConfigPath` | Путь к Configuration.xml или каталогу выгрузки |
| `Mode` | Режим: `overview` (default), `brief`, `full` |
| `Section` | Drill-down по разделу (alias: `Name`). Сейчас: `home-page` |
| `Limit` / `Offset` | Пагинация (по умолчанию 150 строк) |
| `OutFile` | Записать результат в файл (UTF-8 BOM) |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Три режима

| Режим | Что показывает |
|---|---|
| `overview` *(default)* | Заголовок + ключевые свойства + таблица счётчиков объектов по типам |
| `brief` | Одна строка: Имя — "Синоним" vВерсия \| N объектов \| совместимость |
| `full` | Все свойства по категориям + полный список ChildObjects + DefaultRoles + мобильные функциональности |

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
