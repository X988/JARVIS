> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `skd-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация схемы компоновки данных 1С (СКД). Используй после создания или модификации СКД для проверки корректности


# /skd-validate — валидация СКД (DataCompositionSchema)

Проверяет структурную корректность Template.xml схемы компоновки данных. Выявляет ошибки формата, битые ссылки, дубликаты имён.


## Параметры

| Параметр     | Обяз. | Умолч. | Описание                                              |
|--------------|:-----:|---------|---------------------------------------------------------|
| TemplatePath | да    | —       | Путь к Template.xml или каталогу макета                 |
| Detailed     | нет   | —       | Подробный вывод (все проверки, включая успешные)         |
| MaxErrors    | нет   | 20      | Остановиться после N ошибок                             |
| OutFile      | нет   | —       | Записать результат в файл                               |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Проверка по XSD

Порядок элементов, типы и значения дополнительно сверяются с XSD-схемами платформы, если они скачаны в проект. Иначе итоговая строка заканчивается на `XSD not checked: <причина>` — это не «проверено всё». Когда проверка нужна (например, платформа пишет «нарушен порядок следования»), скачай схемы версии формата выгрузки — атрибут `version` в `Configuration.xml` — через `/v8-xsd-fetch -Versions <версия>` и запусти снова. То же при `[WARN] XSD: no schemas for format <версия>`.

Нарушение: `XSD <версия>, line N: <родитель>/<элемент>: <что не так>`.

- `must come before <X>` — перенеси элемент непосредственно перед `<X>`, содержимое не меняй. `duplicate` — удали повтор. `not allowed in <P>` — элементу здесь не место. Иначе — текст о недопустимом значении.
- `[WARN]` с `(no schemas for <версия>)` — сверено по схемам более новой версии: ориентир, не вердикт.
- Если шаблон ты только что собрал или изменил `/skd-compile` или `/skd-edit`, нарушение — дефект навыка: сообщи о нём пользователю.
