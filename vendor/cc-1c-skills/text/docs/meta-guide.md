> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Объекты метаданных конфигурации

Навыки группы `/meta-*` позволяют создавать, анализировать, редактировать и проверять объекты метаданных конфигурации 1С — справочники, документы, регистры, перечисления и ещё 19 типов объектов из XML-выгрузки.

## Навыки

| Навык | Параметры | Описание |
|-------|-----------|----------|
| `/meta-info` | `<ObjectPath> [-Mode] [-Name]` | Анализ структуры объекта: реквизиты, ТЧ, формы, движения, типы (8 режимов) |
| `/meta-compile` | `<JsonPath> <OutputPath>` | Создание объекта метаданных из JSON DSL: реквизиты, ТЧ, свойства, формы |
| `/meta-edit` | `<ObjectPath> -Operation <op> -Value "<val>"` | Точечное редактирование: 30+ атомарных операций (add/remove/modify/set) |
| `/meta-remove` | `<ConfigDir> -Object <Type.Name> [-DryRun] [-Force]` | Безопасное удаление объекта с проверкой ссылок (блокирует при наличии) |
| `/meta-validate` | `<ObjectPath> [-MaxErrors 20]` | Валидация структурной корректности: ~40 проверок |

## Рабочий цикл

```
Описание объекта (текст) → JSON DSL → /meta-compile → XML-исходники → /meta-validate
                                                       ↕ /meta-edit      → /meta-info
                                                       ↕ /meta-remove (безопасное удаление)
```

1. Claude формирует JSON-определение объекта (тип, реквизиты, ТЧ, свойства)
2. `/meta-compile` генерирует XML-исходники с корректными UUID, namespace, структурой ChildObjects
3. `/meta-edit` вносит точечные изменения: добавление/удаление реквизитов, ТЧ, владельцев, движений и т.д.
4. `/meta-remove` безопасно удаляет объект (проверяет ссылки в реквизитах, коде, формах; чистит Configuration.xml и подсистемы)
5. `/meta-validate` проверяет корректность XML
6. `/meta-info` выводит компактную сводку для визуальной проверки

## Поддерживаемые типы объектов (23 типа)

| Группа | Типы |
|--------|------|
| Прикладные | Catalog, Document, Enum, ChartOfCharacteristicTypes, ChartOfAccounts, ChartOfCalculationTypes |
| Процессы | BusinessProcess, Task |
| Регистры | InformationRegister, AccumulationRegister, AccountingRegister, CalculationRegister |
| Отчёты/обработки | Report, DataProcessor |
| Интеграция | ExchangePlan, HTTPService, WebService |
| Журналы | DocumentJournal, Sequence |
| Прочие | Constant, CommonModule, SessionParameter, FunctionalOption, DefinedType |

## Inline mode — типовые операции

### Реквизиты

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Табличные части

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Свойства объекта

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Регистры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## JSON mode — комбинированные операции

Для сложных сценариев (несколько типов изменений в одном вызове) используйте JSON-файл:

```json
{
  "add": {
    "attributes": ["Комментарий: Строка(200)"],
    "tabularSections": [{
      "name": "Товары",
      "attrs": ["Ном: CatalogRef.Ном | req", "Кол: Число(15,3)"]
    }]
  },
  "remove": { "attributes": ["УстаревшийРеквизит"] },
  "modify": {
    "properties": { "DescriptionLength": 150 },
    "attributes": { "СтароеИмя": { "name": "НовоеИмя" } }
  }
}
```

JSON поддерживает русские синонимы ключей (`реквизиты`, `тч`, `измерения` и др.) и типов (`Строка`, `Число`, `СправочникСсылка` и др.).

## Сценарии использования

### Анализ существующего объекта

```
> Покажи структуру справочника Catalogs/Номенклатура
```

Claude вызовет `/meta-info` и покажет: реквизиты с типами, табличные части, формы, владельцев, ввод по строке.

### Создание нового объекта

```
> Создай справочник Контрагенты: код 9, наименование 150, реквизиты ИНН(12), КПП(9),
> иерархический с группами, владелец — Catalog.Организации
```

Claude сформирует JSON и вызовет `/meta-compile` → `/meta-validate` → `/meta-info`.

### Добавление реквизитов к существующему объекту

```
> Добавь в документ Documents/ЗаказКлиента реквизиты Склад (CatalogRef.Склады)
> и ТЧ Товары с реквизитами Номенклатура, Количество, Цена, Сумма
```

Claude вызовет `/meta-edit` дважды: `add-attribute` для реквизита и `add-ts` для ТЧ.

### Настройка движений документа

```
> Документ Documents/ПриходТоваров должен делать движения
> по AccumulationRegister.ОстаткиТоваров и AccumulationRegister.Партии
```

Claude вызовет `/meta-edit` с операцией `set-registerRecords`.

### Удаление неиспользуемого объекта

```
> Удали справочник Catalogs/Устаревший из конфигурации src/
```

Claude вызовет `/meta-remove` с `-DryRun`, покажет что будет удалено и проверит ссылки. Если объект нигде не используется — удалит файлы, уберёт из Configuration.xml и подсистем. Если есть ссылки — покажет список и заблокирует удаление.

### Проверка объекта после изменений

```
> Проверь корректность Documents/ЗаказКлиента
```

Claude вызовет `/meta-validate` и покажет ошибки и предупреждения.

## Структура файлов объекта метаданных

```
<MetaType>/<ObjectName>/
├── <ObjectName>.xml           # Основной XML (Properties, ChildObjects)
├── Ext/
│   └── ObjectModule.bsl       # Модуль объекта (опционально)
├── Forms/
│   └── <FormName>/            # Формы объекта
├── Templates/
│   └── <TemplateName>/        # Макеты
└── Commands/
    └── <CommandName>/         # Команды
```

## Спецификации

- [1c-config-objects-spec.md](1c-config-objects-spec.md) — XML-формат объектов метаданных, Properties, ChildObjects, типы
- [meta-dsl-spec.md](meta-dsl-spec.md) — JSON DSL для описания объектов (`/meta-compile`)
