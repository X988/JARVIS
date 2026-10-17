> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Точечное редактирование объекта метаданных 1С. Используй когда нужно добавить, удалить или изменить реквизиты, табличные части, измерения, ресурсы или свойства существующего объекта конфигурации


# /meta-edit — точечное редактирование метаданных 1С

Атомарные операции модификации существующих XML объектов метаданных.

## Команда

### Inline mode (простые операции)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### JSON mode (сложные/комбинированные)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| ObjectPath | XML-файл или директория объекта (обязательный, авторезолв `<dirName>.xml`) |
| Operation | Inline-операция (альтернатива DefinitionFile) |
| Value | Значение для inline-операции |
| DefinitionFile | JSON-файл с операциями (альтернатива Operation) |
| NoValidate | Не запускать валидацию после правки |

## Частые операции

Batch через `;;` во всех операциях.

| Операция | Формат Value | Пример |
|----------|-------------|--------|
| `add-attribute` | `Имя: Тип \| флаги` | `"Сумма: Число(15,2) \| req, index"` |
| `add-dimension` | `Имя: Тип \| флаги` | `"Организация: CatalogRef.Организации \| master"` |
| `add-resource` | `Имя: Тип` | `"Сумма: Число(15,2)"` |
| `add-column` | `Имя: Тип` | `"Тип: EnumRef.ТипыДокументов"` |
| `add-ts` | `ТЧ: Рекв1: Тип1, Рекв2: Тип2` | `"Товары: Ном: CatalogRef.Ном, Кол: Число(15,3)"` |
| `add-ts-attribute` | `ТЧ.Имя: Тип` | `"Товары.Скидка: Число(15,2)"` |
| `remove-*` | `Имя` | `"СтарыйРеквизит ;; ЕщёОдин"` |
| `remove-ts-attribute` | `ТЧ.Имя` | `"Товары.УстаревшийРекв"` |
| `modify-attribute` | `Имя: ключ=значение` | `"СтароеИмя: name=НовоеИмя, type=Строка(500)"` |
| `modify-ts-attribute` | `ТЧ.Имя: ключ=значение` | `"Товары.Рекв: name=НовоеИмя"` |
| `modify-ts` | `ТЧ: ключ=значение` | `"Товары: synonym=Товарный состав"` |
| `modify-property` | `Ключ=Значение` | `"CodeLength=11 ;; DescriptionLength=150"` |

Позиционная вставка: `"Склад: CatalogRef.Склады >> after Организация"`.

Составной тип — через `+`: `"Значение: Строка + Число(15,2) + Дата"`.

## Быстрые примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Индекс: что правишь → файл

| Что нужно | Файл |
|-----------|------|
| Реквизит, измерение, ресурс, графа: флаги, составные типы, структурные свойства (`Format`, `ChoiceParameters`, `FillValue`, …) | `reference/attributes.md` |
| Табличная часть и её реквизиты | `reference/tabular-sections.md` |
| Свойства самого объекта, списочные свойства (владельцы, движения, основание, ввод по строке) | `reference/properties.md` |
| Предопределённые элементы | `reference/predefined.md` |
| Значения перечисления, команды | `reference/other-children.md` |
| Внешний источник данных: поля, таблицы, функции | `reference/external-data-source.md` |
| Комбинированные операции в одном JSON, синонимы ключей и типов, какие дети допустимы у типа объекта | `reference/json-dsl.md` |

Форму добавляет и удаляет навык `form-add` / `form-remove`, макет — навык `template-add` /
`template-remove`: кроме записи в `ChildObjects` у них есть собственные файлы, и `meta-edit` их не трогает.

## Верификация

```
/meta-validate <ObjectPath>    — валидация после редактирования
/meta-info <ObjectPath>        — визуальная сводка
```
