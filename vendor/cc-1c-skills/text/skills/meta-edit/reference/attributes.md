> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Реквизиты, измерения, ресурсы, графы

Операции над «плоскими» дочерними элементами объекта: реквизит (`attribute`), измерение (`dimension`),
ресурс (`resource`), графа журнала (`column`). Синтаксис у всех один.

## Общие правила

**Batch-режим** — несколько элементов через `;;`:
```
-Value "Комментарий: Строка(200) ;; Сумма: Число(15,2) | index"
```

**Shorthand-формат**: `ИмяРеквизита: Тип | флаги`

Флаги: `req` — обязательное заполнение; `index` — индексировать; `master` — ведущее измерение (только
измерения); `mainFilter` — основной отбор (только измерения).

**Позиционная вставка**: `>> after ИмяЭлемента` или `<< before ИмяЭлемента`:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Составные типы

Разделитель `+`:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

В JSON DSL — массив в `type`:
```json
{ "name": "Значение", "type": ["Строка", "Число(15,2)", "Дата", "CatalogRef.Контрагенты"] }
```

## add-attribute / add-dimension / add-resource / add-column

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## remove-*

Имя элемента (или несколько через `;;`):
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## modify-attribute / modify-dimension / modify-resource / modify-enumValue / modify-column

Формат: `ИмяЭлемента: ключ=значение, ключ=значение`

**Спец-операции** (строчные ключи): `name` (переименование), `type` (смена типа), `synonym`.

**Свойства** задавайте по имени свойства 1С (PascalCase, как в конфигураторе): `Indexing`, `FillChecking`,
`Use`, `FullTextSearch`, `DataHistory`, `PasswordMode`, `MultiLine`, `Mask`, `CreateOnInput`, `QuickChoice` и др.
Свойство можно задать, даже если у реквизита оно ещё не выставлено.

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Структурные свойства реквизита

Свойства со сложным значением задавайте через JSON DSL (`{ "modify": { "attributes": { "Имя": { ... } } } }`):

| Ключ | Значение | Пример (JSON) |
|------|----------|---------------|
| `Format` / `EditFormat` / `ToolTip` | строка (мультиязычная) | `"Format": "ДФ=dd.MM.yyyy"` |
| `ChoiceForm` | путь формы выбора | `"ChoiceForm": "Catalog.Товары.Form.ФормаВыбора"` |
| `MinValue` / `MaxValue` | число или строка | `"MinValue": 0, "MaxValue": 100` |
| `FillValue` | значение заполнения | `"FillValue": "EmptyRef"` · `true` · `10` · `{"nil": true}` |
| `LinkByType` | `{dataPath, linkItem?}` | `"LinkByType": {"dataPath": "Вид", "linkItem": 0}` |
| `ChoiceParameterLinks` | `[{name, dataPath, valueChange?}]` | `["Отбор.Организация=Организация"]` |
| `ChoiceParameters` | `[{name, type?, value?}]` | `[{"name": "Отбор.ЭтоГруппа", "value": false}]` |

- `FillValue`: `"EmptyRef"` — пустая ссылка по типу реквизита; `{"emptyRef": true}` / `{"nil": true}` — явные маркеры.
- `ChoiceParameters` value — булево/число/строка/ссылочный путь или массив; укажите `type` (напр.
  `EnumRef.СтавкиНДС`), чтобы задавать значения короткими именами (`"Оптовая"` вместо полного пути).
- В путях данных (`LinkByType`/`ChoiceParameterLinks`) можно писать короткое имя реквизита вместо полного пути.
