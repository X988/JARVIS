> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `role-edit`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Точечное редактирование существующей роли 1С. Используй когда нужно добавить, снять или запретить права, настроить RLS-ограничения и шаблоны, изменить свойства роли без потери прочих прав и UUID


# /role-edit — точечное редактирование роли 1С

Меняет права существующей роли на месте: UUID, прочие права, RLS и шаблоны сохраняются.
Создание новой роли — `/role-compile`.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `RolePath` | Каталог роли, `Roles/Имя.xml` или `Roles/Имя/Ext/Rights.xml` |
| `Operation` | Одна операция из таблицы ниже |
| `Value` | Значение операции; несколько значений — через `;;` |
| `DefinitionFile` | JSON-массив операций (альтернатива `Operation`) — так задают несколько разных операций |
| `NoValidate` | Не запускать `role-validate` после правки |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Операции применяются в том порядке, в котором перечислены.

## Операции

| Операция | Формат `Value` | Описание |
|----------|----------------|----------|
| `add-rights` | `Тип.Имя: Право1, Право2` или `Тип.Имя: @пресет` | Добавить права, прежние сохранить |
| `set-rights` | то же | Заменить набор прав объекта целиком |
| `remove-rights` | `Тип.Имя: Право1, Право2` — снять права<br>`Тип.Имя` — удалить объект целиком | Снять права |
| `deny-rights` | `Тип.Имя: Право1, Право2` | Закрыть реквизит или ТЧ, которые иначе наследуют права объекта |
| `set-rls` | `Тип.Имя.Право: условие`<br>`Тип.Имя.Право[Поле1, Поле2]: условие` | Ограничение доступа к данным |
| `remove-rls` | `Тип.Имя.Право` — снять все<br>`Тип.Имя.Право[Поле1]` — снять одну строку | Снять ограничение, право оставить |
| `add-template` | `Имя(Параметры): условие` | Добавить шаблон ограничения |
| `set-template` | то же | Заменить шаблон, а если его нет — добавить |
| `remove-template` | `Имя(Параметры)` или `Имя` | Удалить шаблон |
| `modify-property` | `setForNewObjects=true`<br>`setForAttributesByDefault=false`<br>`independentRightsOfChildObjects=true` | Глобальные флаги роли |
| `set-synonym` | текст | Синоним роли |
| `set-comment` | текст | Комментарий роли |

## Быстрые примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Несколько разных операций — списком в файле:

```json
[
  { "operation": "add-rights", "value": "Catalog.Товары: @view" },
  { "operation": "set-rls", "value": "Catalog.Товары.Read: #ПоОрганизации(\"\")" }
]
```

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Права

Имена объектов и прав — те же, что в `/role-compile`: `Catalog`, `Read`, пресеты `@view` и
`@edit`, вложенные пути (`Catalog.Контрагенты.Attribute.ИНН: View, Edit`), короткая запись сервиса
(`HTTPService.ЭДО: Use` раскрывается по всем методам шаблонов URL).

`remove-rights` и `deny-rights` задевают больше перечисленного: уходят и права, которым снятое
нужно (сняли `Read` — уйдут `Update`, `View`, `Edit`). Снятое каскадом перечисляется в выводе.

Ошибка в значении — отказ до записи, файл не меняется. Полные таблицы «тип → права» и виды
вложенности — в справке `/role-compile`.

## RLS

Ограничения права — это список строк, как в таблице «Ограничения доступа к данным» редактора.
Строка без списка полей действует на все прочие поля, строка со списком — только на них.
Типовой приём: закрыть данные целиком, но оставить поля представления ссылки открытыми, иначе
ссылки на объект превратятся в «объект не найден»:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Строка с тем же набором полей заменяется, с другим — добавляется. Право должно быть уже выдано:
ограничение без права платформа игнорирует, поэтому навык откажет.

Ссылка на шаблон — `#ИмяШаблона("")`; `&` в условиях экранируется автоматически.

## Значение из файла

Вместо текста можно указать `@путь` — условие RLS, тело шаблона, синоним и комментарий берутся из
файла. Относительный путь ищется рядом с `DefinitionFile`, затем в текущем каталоге. Разделитель
`;;` внутри файла остаётся обычным текстом.

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Верификация

```
/role-info <RightsPath>      — сводка прав после правки
/role-validate <RightsPath>  — проверка корректности (запускается автоматически)
```
