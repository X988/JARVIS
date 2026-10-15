> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# ExchangePlan (План обмена)

Близок к справочнику (без иерархии/владельцев), плюс состав объектов обмена. Наследует слой Catalog:
`codeLength`, `codeAllowedLength`, `descriptionLength`, `defaultPresentation`, `editType`, `quickChoice`,
`choiceMode`, формы, `standardAttributes`, `characteristics`, `inputByString`, `basedOn`, представления —
см. `catalog.md` / `attributes.md` / `blocks.md`.

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `comment` | пусто | строка |
| `distributedInfoBase` | `false` | bool (распределённая ИБ — РИБ) |
| `includeConfigurationExtensions` | `false` | bool (включать расширения конфигурации) |
| `descriptionLength` | `150` | длина наименования |
| `createOnInput` | `DontUse` | `Auto` / `Use` / `DontUse` |
| `dataLockControlMode` | `Managed` | `Automatic` / `Managed` |
| `dataHistory` | `DontUse` | `Use` / `DontUse` |
| `useStandardCommands` | `true` | bool |
| `content` | `[]` | состав обмена (см. ниже) |
| `attributes` / `tabularSections` | `[]` / `{}` | реквизиты / табличные части |

## `content` — состав плана обмена

Список объектов-участников обмена; у каждого — признак авторегистрации изменений (по умолчанию выключена).
Элемент — ссылка на объект метаданных (строка) или объект с признаком:

```json
"content": [
  "Catalog.Организации",                                    // авторегистрация выключена
  "InformationRegister.Курсы: autoRecord",                  // авторегистрация включена (токен)
  { "metadata": "Document.РеализацияТоваров", "autoRecord": true }
]
```

- Строка `"Тип.Имя"` — авторегистрация выключена; суффикс `: autoRecord` — включена.
- Объект: `metadata` (ссылка), `autoRecord` (bool или `Allow`/`Deny`).

```json
{ "type": "ExchangePlan", "name": "ОбменССайтом", "distributedInfoBase": false,
  "content": ["Catalog.Номенклатура: autoRecord", "Catalog.Контрагенты: autoRecord"],
  "attributes": ["АдресСервера: String(200)"] }
```
