> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Значения перечисления и команды

## add-enumValue / add-command

Просто имена (batch через `;;`):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Команда создаётся вместе с заготовкой модуля `Commands/<Имя>/Ext/CommandModule.bsl`.

## Формы и макеты — другими навыками

Кроме записи в `ChildObjects` у формы и макета есть собственные файлы, поэтому `meta-edit` их
не добавляет и не удаляет:

| Что | Добавить | Удалить |
|-----|----------|---------|
| Форма | навык `form-add` | навык `form-remove` |
| Макет | навык `template-add` | навык `template-remove` |

Содержимое формы собирает навык `form-compile`.
