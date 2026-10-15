> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Схема компоновки данных (СКД)

Навыки группы `/skd-*` позволяют анализировать, создавать, редактировать и проверять схемы компоновки данных 1С — XML-файлы DataCompositionSchema (Template.xml).

## Навыки

| Навык | Параметры | Описание |
|-------|-----------|----------|
| `/skd-info` | `<TemplatePath> [-Mode] [-Name]` | Анализ структуры СКД: наборы, поля, параметры, ресурсы, варианты (11 режимов, включая full) |
| `/skd-compile` | `[-DefinitionFile <json> \| -Value <json-string>] -OutputPath <Template.xml>` | Генерация Template.xml из JSON DSL: наборы, поля, итоги, параметры, варианты |
| `/skd-decompile` | `<TemplatePath> [-OutputPath <out.json>]` | Преобразование Template.xml в JSON-черновик в формате `/skd-compile` — для нового отчёта по образцу или структурной переработки существующего. Из соображений предосторожности исключён из автоматического подбора моделью — вызывается только явной командой |
| `/skd-edit` | `<TemplatePath> -Operation <op> -Value "<value>"` | Точечное редактирование: 26 атомарных операций (add/set/patch/modify/clear/remove) |
| `/skd-validate` | `<TemplatePath> [-MaxErrors 20]` | Валидация структурной корректности: ~30 проверок |

## Рабочий цикл

```
Описание отчёта (текст) → JSON DSL → /skd-compile → Template.xml → /skd-validate
                          ↑                          ↕ /skd-edit    → /skd-info
                          └──── /skd-decompile ──────┘
```

1. Claude формирует JSON-определение СКД (shorthand-поля, параметры, итоги, варианты) — либо с нуля по описанию, либо `/skd-decompile` готовит черновик по существующему Template.xml
2. `/skd-compile` генерирует Template.xml с корректными namespace, типами, группировками
3. `/skd-edit` вносит точечные изменения: добавление полей, фильтров, наборов данных, вариантов, условного оформления и т.д.
4. `/skd-validate` проверяет корректность XML
5. `/skd-info` выводит компактную сводку для визуальной проверки

### Когда `/skd-decompile`, а когда `/skd-edit`

- **`/skd-edit`** — точечные правки готового отчёта (добавить поле, фильтр, итог, переименовать параметр). Меняет XML адресно, без полной реконструкции, не задевает непокрытые конструкции.
- **`/skd-decompile` → правка JSON → `/skd-compile`** — сценарии, где правки структурны: новый отчёт по образцу существующего, переработка варианта, перерисовка макета, перебор набора полей. Цикл переписывает Template.xml целиком.

  **Полнота не гарантируется.** Известные декомпилятору непокрытые конструкции явно отмечаются маркерами в JSON и собираются в файл предупреждений — компилятор откажется собирать такой черновик, пока маркеры не разрешены вручную или не удалены. Но возможны и **тихие потери** — мелкое оформление, редкие настройки, незнакомые декомпилятору расширения. Это даёт валидный XML без части функциональности, и Конфигуратор такой результат не отбракует. Именно поэтому навык не предназначен для точечных правок (для них есть `/skd-edit`) и исключён из автоматического подбора моделью — вызывается только явной командой пользователя. Решение использовать пересобранный Template.xml — на стороне пользователя, и сверка с оригиналом перед коммитом остаётся его ответственностью.

## JSON DSL — компактный формат

СКД описываются в JSON с двумя уровнями детализации для каждой секции:

### Минимальный пример

```json
{
  "dataSets": [{
    "query": "ВЫБРАТЬ Номенклатура.Наименование ИЗ Справочник.Номенклатура КАК Номенклатура",
    "fields": ["Наименование"]
  }]
}
```

Умолчания: dataSource создаётся автоматически (`ИсточникДанных1/Local`), набор получает имя `НаборДанных1`, вариант настроек "Основной" с деталями.

### Поля — shorthand

```json
"fields": [
  "Наименование",
  "Количество: decimal(15,2)",
  "Организация: CatalogRef.Организации @dimension",
  "Служебное: string #noFilter #noOrder"
]
```

Формат: `Имя[: Тип] [@роль...] [#ограничение...]`. Роли: `@dimension`, `@account`, `@balance`, `@period`. Ограничения: `#noField`, `#noFilter`, `#noGroup`, `#noOrder`.

### Итоги — shorthand

```json
"totalFields": ["Количество: Сумма", "Стоимость: Сумма(Кол * Цена)"]
```

Формат: `Поле: Функция` или `Поле: Функция(выражение)`. Объектная форма поддерживает привязку к группировкам: `{ "dataPath": "X", "expression": "Сумма(X)", "group": ["Группа1", "ОбщийИтог"] }`.

### Параметры — shorthand + @autoDates

```json
"parameters": [
  "Период: StandardPeriod = LastMonth @autoDates",
  "Организация: CatalogRef.Организации"
]
```

Флаги: `@autoDates` (авто ДатаНачала/ДатаОкончания), `@valueList` (разрешить список значений), `@hidden` (скрыть параметр, исключить из `dataParameters: auto`).

### Вычисляемые поля — shorthand

```json
"calculatedFields": ["Итого = Количество * Цена"]
```

### Варианты настроек — shorthand

```json
"settingsVariants": [{
  "name": "Основной",
  "settings": {
    "selection": ["Номенклатура", "Количество", "Сумма"],
    "filter": ["Организация = _ @off @user"],
    "order": ["Сумма desc"],
    "dataParameters": ["Период = LastMonth @user"],
    "outputParameters": { "Заголовок": "Мой отчёт" },
    "structure": "Организация > details"
  }
}]
```

- **filter shorthand**: `"Поле оператор значение @флаги"` — флаги `@off`, `@user`, `@quickAccess`, `@normal`, `@inaccessible`
- **dataParameters shorthand**: `"Имя = значение @флаги"`, или `"auto"` — автогенерация для всех не-hidden параметров
- **structure shorthand**: `"Поле1 > Поле2 > details"` — `>` разделяет уровни группировки
- **conditionalAppearance**: условное оформление с автоопределением типов (Color, Boolean, LocalStringType для Формат/Текст/Заголовок, DesignTimeValue для ссылок), OrGroup через `{"group": "Or", "items": [...]}`
- **selection**: поддержка `{"folder": "Название", "items": [...]}` для группировки полей (SelectedItemFolder)
- **parameters**: `availableValues`, `denyIncompleteValues`, `use: "Always"` в объектной форме

### Шаблоны вывода — компактный DSL

Для отчётов с фиксированным оформлением (ФСД, ведомости) — табличное описание вместо raw XML:

```json
"templates": [
  {
    "name": "Макет1", "style": "header",
    "widths": [36, 33, 16, 17], "minHeight": 24.75,
    "rows": [
      ["Виды кассы", "Валюта", "Остаток на начало\nпериода", "Остаток на конец периода"],
      ["|", "|", "|", "|"],
      ["К1", "К2", "К3", "К4"]
    ]
  },
  {
    "name": "Макет2", "style": "data",
    "widths": [36, 33, 16, 17],
    "rows": [["{ВидКассы}", "{Валюта}", "{Остаток}", "{ОстатокКонец}"]],
    "parameters": [
      { "name": "ВидКассы", "expression": "Представление(Счет)" }
    ]
  }
],
"groupTemplates": [
  { "groupName": "ДанныеОтчета", "templateType": "GroupHeader", "template": "Макет1" },
  { "groupField": "Счет", "templateType": "Header", "template": "Макет2" }
]
```

Синтаксис ячеек: `"текст"` — статика, `"{Имя}"` — параметр, `"|"` — объединение с ячейкой выше, `null` — пустая.

Привязки: `groupField` — к полю, `groupName` — к именованной группировке. `templateType`: `Header`/`OverallHeader` → `<groupTemplate>`, `GroupHeader` → `<groupHeaderTemplate>`.

Расшифровка (drilldown): ключ `drilldown` в параметре шаблона генерирует `DetailsAreaTemplateParameter` и привязку `Расшифровка` в appearance ячеек.

Встроенные стили: `header` (фон, центр, перенос), `data` (фон группы), `subheader` (без фона, центр), `total` (без фона). Все — Arial 10, рамки Solid 1px, цвета через стили платформы. Пользовательские стили — через `skd-styles.json` в директории проекта.

### Объектная форма

Все секции поддерживают полную объектную форму для сложных случаев (title, appearance, role с выражениями, userSettingID, userSettingPresentation, conditionalAppearance, группы фильтров And/Or/Not и т.д.). Подробности — в [спецификации SKD DSL](skd-dsl-spec.md).

## Сценарии использования

### Анализ существующей СКД

```
> Проанализируй схему компоновки отчёта Reports/АнализНДФЛ/Templates/ОсновнаяСхемаКомпоновкиДанных
```

Claude вызовет `/skd-info` (overview → trace → query → variant) и опишет:
- наборы данных и их поля
- параметры и значения по умолчанию
- ресурсы и формулы агрегации
- структуру группировок в вариантах настроек

### Создание СКД по описанию

```
> Создай СКД для отчёта по продажам: группировка по организациям,
> поля Номенклатура, Количество, Сумма. Период — параметр.
```

Claude сформирует JSON (запрос можно вынести в файл: `"query": "@queries/sales.sql"`):
```json
{
  "dataSets": [{
    "name": "Продажи",
    "query": "ВЫБРАТЬ ...",
    "fields": [
      "Организация: CatalogRef.Организации @dimension",
      "Номенклатура: CatalogRef.Номенклатура @dimension",
      "Количество: decimal(15,3)",
      "Сумма: decimal(15,2)"
    ]
  }],
  "totalFields": ["Количество: Сумма", "Сумма: Сумма"],
  "parameters": ["Период: StandardPeriod = LastMonth @autoDates"],
  "settingsVariants": [{
    "name": "Основной",
    "settings": {
      "selection": ["Номенклатура", "Количество", "Сумма"],
      "dataParameters": ["Период = LastMonth @user"],
      "structure": "Организация > details"
    }
  }]
}
```

И вызовет `/skd-compile` → `/skd-validate` → `/skd-info`.

### Проверка существующей СКД

```
> Проверь корректность СКД Reports/МойОтчёт/Templates/ОсновнаяСхемаКомпоновкиДанных/Ext/Template.xml
```

Claude вызовет `/skd-validate` и покажет результат: ошибки (битые ссылки, дубликаты, невалидные типы) и предупреждения.

## Структура файлов СКД

```
<Объект>/Templates/
├── ИмяМакета.xml              # Метаданные (UUID, TemplateType=DataCompositionSchema)
└── ИмяМакета/
    └── Ext/
        └── Template.xml        # Тело схемы (DataCompositionSchema)
```

## Спецификации

- [1c-dcs-spec.md](1c-dcs-spec.md) — XML-формат DataCompositionSchema, namespace, элементы, типы
- [skd-dsl-spec.md](skd-dsl-spec.md) — JSON DSL для описания СКД (формат входных данных `/skd-compile`)
