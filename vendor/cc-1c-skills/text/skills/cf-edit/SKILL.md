> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cf-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Точечное редактирование конфигурации 1С. Используй когда нужно изменить свойства конфигурации, добавить или удалить объект из состава, настроить роли по умолчанию, поменять раскладку панелей, настроить начальную страницу


# /cf-edit — редактирование конфигурации 1С

Точечное редактирование Configuration.xml: свойства, состав ChildObjects, роли по умолчанию.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `ConfigPath` | Путь к Configuration.xml или каталогу выгрузки |
| `Operation` | Операция (см. таблицу) |
| `Value` | Значение для операции (batch через `;;`) |
| `DefinitionFile` | JSON-файл с массивом операций |
| `NoValidate` | Пропустить авто-валидацию |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Операции

| Операция | Формат Value | Описание |
|----------|-------------|----------|
| `modify-property` | `Ключ=Значение` (batch `;;`) | Изменить свойство |
| `add-childObject` | `Type.Name` (batch `;;`) | Зарегистрировать уже существующий файл объекта в ChildObjects. Для создания нового объекта используй `/meta-compile`, `/role-compile`, `/subsystem-compile` — они регистрируют автоматически |
| `remove-childObject` | `Type.Name` (batch `;;`) | Удалить объект из ChildObjects |
| `sort-childObjects` | вид, напр. `Catalog` (batch `;;`), либо пусто | Упорядочить ChildObjects по имени внутри вида. Без значения — все виды, кроме четырёх (см. reference) |
| `add-defaultRole` | `Role.Name` или `Name` | Добавить роль по умолчанию |
| `remove-defaultRole` | `Role.Name` или `Name` | Удалить роль по умолчанию |
| `set-defaultRoles` | Имена через `;;` | Заменить список ролей по умолчанию |
| `set-panels` | JSON-объект (см. [reference.md](reference.md)) | Перезаписать `Ext/ClientApplicationInterface.xml` (раскладка панелей) |
| `set-home-page` | JSON-объект (см. [reference.md](reference.md)) | Перезаписать `Ext/HomePageWorkArea.xml` (начальная страница) |

Допустимые значения свойств, формат DefinitionFile (JSON), каноничный порядок: [reference.md](reference.md)

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
