> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cfe-diff`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Анализ расширения конфигурации 1С (CFE) — состав, заимствованные объекты, перехватчики, проверка переноса. Используй когда нужно понять что содержит расширение или проверить перенесены ли вставки в конфигурацию


# /cfe-diff — Анализ расширения конфигурации

Анализирует расширение в двух режимах: обзор изменений (Mode A) или проверка переноса (Mode B).

## Параметры

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `ExtensionPath` | Путь к расширению (обязат.) | — |
| `ConfigPath` | Путь к конфигурации (обязат.) | — |
| `Mode` | `A` (обзор) / `B` (проверка переноса) | `A` |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Mode A — обзор расширения

Для каждого объекта показывает:
- `[BORROWED]` — заимствованный: перехватчики (`&Перед`, `&После`, `&ИзменениеИКонтроль`, `&Вместо`), собственные реквизиты/ТЧ/формы
- `[OWN]` — собственный: количество реквизитов, ТЧ, форм

Для каждой формы заимствованного объекта показывается:
- `(borrowed)` / `(own)` — заимствованная или собственная форма
- callType-события формы и элементов
- callType на командах

## Mode B — проверка переноса

Для каждого `&ИзменениеИКонтроль` извлекает блоки `#Вставка`/`#КонецВставки` из расширения и ищет их в соответствующем модуле конфигурации.

Статусы:
- `[TRANSFERRED]` — код найден в конфигурации
- `[NOT_TRANSFERRED]` — код не найден
- `[NEEDS_REVIEW]` — нет блоков `#Вставка` или модуль конфигурации не найден

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
