> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Предопределённые элементы

Добавить предопределённые элементы (Catalog, ChartOfCharacteristicTypes). Существующие элементы и их
идентификаторы сохраняются, новые получают свежий id.

Inline — строка `(Код) Имя [Наименование]` (batch через `;;`; `[Наименование]` необязательно — иначе авто из имени):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

JSON — строки и/или объекты (для групп с вложенными):
```json
{ "add": { "predefined": [
  "(001) Основной",
  { "name": "Группа", "isFolder": true, "childItems": ["(002) Вложенный"] }
] } }
```

Ключи объекта: `name`, `code`, `description`, `isFolder`, `childItems` (дерево). Тип кода (строковый/числовой)
берётся из объекта автоматически.
