> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Catalog (Справочник)

```json
{ "type": "Catalog", "name": "Организации", "descriptionLength": 100,
  "attributes": ["ИНН: String(12)", "КПП: String(9)"] }
```

## Свойства

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `comment` | пусто | строка |
| `hierarchical` | `false` | bool |
| `hierarchyType` | `HierarchyFoldersAndItems` | `HierarchyFoldersAndItems` / `HierarchyOfItems` |
| `limitLevelCount` | `false` | bool (ограничивать кол-во уровней) |
| `levelCount` | `2` | число уровней (при `limitLevelCount`) |
| `foldersOnTop` | `true` | bool (группы сверху) |
| `owners` | `[]` | массив владельцев: `["Catalog.Контрагенты"]` |
| `subordinationUse` | `ToItems` | `ToItems` / `ToFolders` / `ToFoldersAndItems` (кому подчинён) |
| `codeLength` | `9` | длина кода (0 — без кода) |
| `codeType` | `String` | `String` / `Number` |
| `codeAllowedLength` | `Variable` | `Variable` / `Fixed` |
| `codeSeries` | `WholeCatalog` | `WholeCatalog` / `WithinSubordination` / `WithinOwnerSubordination` |
| `autonumbering` | `true` | bool (автонумерация) |
| `checkUnique` | `false` | bool (контроль уникальности кода) |
| `descriptionLength` | `25` | длина наименования |
| `defaultPresentation` | `AsDescription` | `AsDescription` / `AsCode` |
| `quickChoice` | `true` | bool (быстрый выбор) |
| `choiceMode` | `BothWays` | `BothWays` / `QuickChoice` / `FromForm` |
| `editType` | `InDialog` | `InDialog` / `InList` / `BothWays` |
| `createOnInput` | `Use` | `Auto` / `Use` / `DontUse` |
| `choiceHistoryOnInput` | `Auto` | `Auto` / `DontUse` |
| `fullTextSearch` | `Use` | `Use` / `DontUse` |
| `fullTextSearchOnInputByString` | `DontUse` | `Use` / `DontUse` |
| `searchStringModeOnInputByString` | `Begin` | `Begin` / `AnyPart` |
| `predefinedDataUpdate` | `Auto` | `Auto` / `DontAutoUpdate` / `AutoUpdate` |
| `dataLockControlMode` | `Managed` | `Automatic` / `Managed` |
| `useStandardCommands` | `true` | bool |
| `includeHelpInContents` | `false` | bool |
| `attributes` | `[]` | реквизиты (shorthand / объектная форма) |
| `tabularSections` | `{}` | табличные части |

**Формы.** Ссылка на форму — `Тип.Объект.Form.ИмяФормы` (напр. `Catalog.Организации.Form.ФормаЭлемента`).
Слоты основных форм: `defaultObjectForm`, `defaultFolderForm`, `defaultListForm`, `defaultChoiceForm`,
`defaultFolderChoiceForm`; вспомогательных — те же имена с префиксом `auxiliary` (`auxiliaryObjectForm`, …).

## `predefined` — предопределённые элементы

Массив предопределённых элементов → `Ext/Predefined.xml`. Элемент — строка (плоский случай) или объект (иерархия).

**Строка:** `"(Код) Имя [Наименование]"` — `Имя` обязательно; `(Код)` и `[Наименование]` опциональны.
Без `[...]` наименование выводится из имени; `[]` — пустое; `[текст]` — заданное.

```json
"predefined": [
  "Основной",
  "(1) ДокументОПриемке [Документ о приемке]",
  { "name": "Группа1", "isFolder": true, "description": "Прочие",
    "childItems": ["Факс", "(7) Скайп"] }
]
```

**Объект:** `name` (обязательно), `code`, `description` (наименование), `isFolder` (признак группы),
`childItems` (вложенные, рекурсивно). Тип кода — по свойству `codeType`.

## Дополнительно

- Свойства реквизитов и табличных частей — `attributes.md`.
- Представления (`objectPresentation`, `listPresentation`, …), команды объекта, характеристики
  («ДопРеквизиты и сведения»), кастомизация стандартных реквизитов, `inputByString` / `dataLockFields` /
  `basedOn` — `blocks.md`.
