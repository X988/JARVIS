> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Enum, Constant, DefinedType

## Enum (Перечисление)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `values` | `[]` | значения перечисления (массив имён или объектов) |

Значение — строка `"ИмяЗначения"` или объект `{ name, synonym }`.

```json
{ "type": "Enum", "name": "Статусы", "values": ["Новый", "ВРаботе", "Закрыт"] }
```

## Constant (Константа)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `valueType` | `String` | тип значения (shorthand типа) |
| `dataLockControlMode` | `Managed` | `Automatic` / `Managed` |

`valueType` принимает shorthand: `"String(100)"`, `"Number(15,2)"`, `"Boolean"`, `"CatalogRef.Валюты"`,
составной через `+`.

```json
{ "type": "Constant", "name": "ОсновнаяВалюта", "valueType": "CatalogRef.Валюты" }
```

## DefinedType (Определяемый тип)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `valueTypes` | `[]` | состав типа (массив shorthand-типов) |
| `valueType` | — | то же одной строкой (`"A + B"`) или строкой одного типа |

```json
{ "type": "DefinedType", "name": "ДенежныеСредства",
  "valueTypes": ["CatalogRef.БанковскиеСчета", "CatalogRef.Кассы"] }
{ "type": "DefinedType", "name": "ФлагАктивности", "valueType": "Boolean" }
```
