> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Свойства объекта и свойства-списки

Справочник операций для обычных свойств объекта и свойств-списков (Owners, RegisterRecords, BasedOn, InputByString).

## modify-property

Изменение свойств объекта по имени свойства 1С (PascalCase, как в конфигураторе). Формат: `Ключ=Значение`
(batch через `;;`):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Свойство можно задать, даже если оно ещё не выставлено у объекта (например `FullTextSearch`, `DataHistory`).
Допустимы имена свойств соответствующего типа объекта.

### Type — тип значения (Константа, ПВХ)

`Type=...` перестраивает дескриптор типа значения. Значение — тип 1С в том же синтаксисе,
что у реквизитов: составной через `+`, с квалификаторами и ссылочными типами:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
Структурные свойства (со вложенными узлами) через `Ключ=Значение` не задаются — исключение только `Type`.

## Свойства-списки

Свойства, значение которых — список ссылок. Управляются через inline `add-*` / `remove-*` / `set-*` и через JSON `modify.properties`.

| Свойство | Объекты | Inline-значение |
|----------|---------|-----------------|
| Owners | Catalog | `Catalog.XXX` |
| RegisterRecords | Document, Sequence | `AccumulationRegister.XXX` |
| BasedOn | ссылочные* | `Document.XXX` |
| InputByString | ссылочные* | `StandardAttribute.Description` |
| DataLockFields | ссылочные* | `Организация` (короткое имя реквизита → полный путь) |
| RegisteredDocuments | DocumentJournal | `Document.XXX` |

\* Catalog, Document, ChartOfCharacteristicTypes, ChartOfAccounts, ChartOfCalculationTypes, ExchangePlan, BusinessProcess, Task.

### add-owner / add-registerRecord / add-basedOn / add-registeredDocument

Полное имя метаданных `MetaType.Name`:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### add-inputByString / add-dataLockField

Пути полей (короткое имя реквизита разворачивается в полный путь автоматически):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### remove-owner / remove-registerRecord / remove-basedOn / remove-inputByString / remove-dataLockField / remove-registeredDocument

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### set-owners / set-registerRecords / set-basedOn / set-inputByString / set-dataLockFields / set-registeredDocuments

Заменяют **весь список** (в отличие от add/remove):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
