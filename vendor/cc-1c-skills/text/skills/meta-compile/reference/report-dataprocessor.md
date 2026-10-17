> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Report, DataProcessor (Отчёты и Обработки)

Почти идентичны по составу: реквизиты, табличные части, формы, макеты, команды. Модуль объекта — `Ext/ObjectModule.bsl`.
Реквизиты и ТЧ — `attributes.md`; команды — `blocks.md`.

Ссылки на формы/схемы/хранилища пишутся **как есть** (имя формы может быть буквально «Форма»).

## Report (Отчёт)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `comment` | пусто | строка |
| `useStandardCommands` | `true` | bool (доступность через стандартный командный интерфейс) |
| `mainDataCompositionSchema` | пусто | основной макет СКД (`Report.X.Template.ОсновнаяСхемаКомпоновкиДанных`) |
| `defaultForm` / `auxiliaryForm` | пусто | основная / вспомогательная форма |
| `defaultSettingsForm` / `auxiliarySettingsForm` / `defaultVariantForm` | пусто | формы настроек / вариантов |
| `variantsStorage` / `settingsStorage` | пусто | хранилища вариантов / настроек (`SettingsStorage.X`) |
| `extendedPresentation` / `explanation` | пусто | представление / пояснение (ML) |
| `includeHelpInContents` | `false` | bool |
| `attributes` / `tabularSections` | `[]` / `{}` | реквизиты / табличные части |

```json
{ "type": "Report", "name": "АнализПродаж", "useStandardCommands": false,
  "mainDataCompositionSchema": "Report.АнализПродаж.Template.ОсновнаяСхемаКомпоновкиДанных",
  "attributes": ["Период: StandardPeriod"] }
```

## DataProcessor (Обработка)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `comment` | пусто | строка |
| `useStandardCommands` | `true` | bool |
| `defaultForm` / `auxiliaryForm` | пусто | основная / вспомогательная форма |
| `extendedPresentation` / `explanation` | пусто | представление / пояснение (ML) |
| `includeHelpInContents` | `false` | bool |
| `attributes` / `tabularSections` | `[]` / `{}` | реквизиты / табличные части |

```json
{ "type": "DataProcessor", "name": "ЗагрузкаТаблиц", "useStandardCommands": false,
  "attributes": [{ "name": "Таблица", "type": "ValueTree" }, { "name": "Произвольные", "type": "" }] }
```

> Реквизиты отчётов/обработок допускают платформенные типы-коллекции: `ValueTable`, `ValueTree`, `ValueList`,
> `StandardPeriod`, `SpreadsheetDocument` и др., а также `"type": ""` — реквизит без типа.
