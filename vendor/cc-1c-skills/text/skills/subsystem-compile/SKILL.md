> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `subsystem-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Создать подсистему 1С — XML-исходники из JSON-определения. Используй когда нужно добавить подсистему (раздел) в конфигурацию


# /subsystem-compile — генерация подсистемы из JSON

Принимает JSON-определение подсистемы → генерирует XML + файловую структуру + регистрирует в родителе (Configuration.xml или родительская подсистема).

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `DefinitionFile` | Путь к JSON-файлу определения |
| `Value` | Инлайн JSON-строка (альтернатива DefinitionFile) |
| `OutputDir` | Корень выгрузки (где `Subsystems/`, `Configuration.xml`) |
| `Parent` | Путь к XML родительской подсистемы (для вложенных) |
| `NoValidate` | Пропустить авто-валидацию |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## JSON-определение

```json
{
  "name": "МояПодсистема",
  "synonym": "Моя подсистема",
  "comment": "",
  "includeInCommandInterface": true,
  "useOneCommand": false,
  "explanation": "Описание раздела",
  "picture": "CommonPicture.МояКартинка",
  "content": ["Catalog.Товары", "Document.Заказ"]
}
```

Минимально: только `name`. Остальное — дефолты.

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
