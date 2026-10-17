> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `subsystem-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Точечное редактирование подсистемы 1С. Используй когда нужно добавить или удалить объекты из подсистемы, управлять дочерними подсистемами или изменить свойства


# /subsystem-edit — редактирование подсистемы 1С

Точечное редактирование XML подсистемы: состав, дочерние подсистемы, свойства.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `SubsystemPath` | Путь к XML-файлу подсистемы |
| `DefinitionFile` | JSON-файл с массивом операций |
| `Operation` | Одна операция (альтернатива DefinitionFile) |
| `Value` | Значение для операции |
| `NoValidate` | Пропустить авто-валидацию |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Операции

| Операция | Значение | Описание |
|----------|----------|----------|
| `add-content` | `"Catalog.X"` или `["Catalog.X","Document.Y"]` | Добавить объекты в Content |
| `remove-content` | `"Catalog.X"` или `["Catalog.X"]` | Удалить объекты из Content |
| `add-child` | `"ИмяПодсистемы"` | Добавить дочернюю подсистему в ChildObjects |
| `remove-child` | `"ИмяПодсистемы"` | Удалить дочернюю подсистему |
| `set-property` | `{"name":"prop","value":"val"}` | Изменить свойство (Synonym, IncludeInCommandInterface, UseOneCommand, etc.) |

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
