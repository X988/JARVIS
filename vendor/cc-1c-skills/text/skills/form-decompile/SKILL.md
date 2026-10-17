> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `form-decompile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Декомпиляция управляемой формы 1С (Form.xml) в JSON-черновик в формате form-compile. Используй для scaffold новой формы по образцу или структурного рефакторинга. Не для точечных правок


# /form-decompile — JSON-черновик из Form.xml управляемой формы

Читает Form.xml и эмитит компактный JSON в формате `form-compile`. **Результат — черновик**, а не обратимое представление: см. раздел «Что получаешь».

## Когда использовать

- **Scaffold новой формы по образцу** — взять существующую форму, получить JSON, поправить и скомпилировать в новую.
- **Структурный рефакторинг** — перебрать дерево элементов, реквизиты, команды.

## Когда **не** использовать

- **Точечные правки готовой формы** (добавить элемент, реквизит, команду; переставить элемент, перенести в другую группу, поменять заголовок или видимость, удалить) → `/form-edit`. Цикл «декомпиляция → правка JSON → компиляция» переписывает форму целиком, может терять непокрытые конструкции и даёт большой diff. `/form-edit` правит адресно.

## Параметры

| Параметр | Описание |
|----------|----------|
| `FormPath` | Путь к Form.xml (обязательный) |
| `OutputPath` | Путь к выходному JSON. Если не задан — JSON в stdout |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Что получаешь

JSON-черновик в формате `/form-compile` — **не полное обратимое представление**: раундтрип `xml → json → xml` не гарантируется, часть конструкций DSL не покрывает и **теряет молча**.

Критичные конструкции (`ConditionalAppearance` со scope, design-time диаграммы/планировщики на реквизите, неизвестный тип элемента, не-Form root) → скрипт падает с ненулевым кодом и сообщением в stderr; для правок такой формы — `/form-edit`.

## Workflow

1. `/form-decompile <Form.xml> -OutputPath draft.json` — получить черновик.
2. Поправить JSON под задачу.
3. `/form-compile -JsonPath draft.json -OutputPath new/Form.xml` — собрать обратно.
4. `/form-validate` + `/form-info` — проверить результат.
