> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `erf-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация внешнего отчёта 1С (ERF). Используй после создания или модификации отчёта для проверки корректности


# /erf-validate — валидация внешнего отчёта (ERF)

Проверяет структурную корректность XML-исходников внешнего отчёта: корневую структуру, InternalInfo, свойства (включая MainDataCompositionSchema), ChildObjects, реквизиты, табличные части, уникальность имён, наличие файлов форм и макетов.

Использует тот же скрипт, что и `/epf-validate` — автоопределение по типу элемента (ExternalReport).

Проверяется XML. Синтаксис модулей проверяет сборка: `/epf-build`, `/erf-build`.

## Параметры

| Параметр   | Обяз. | Умолч. | Описание                                      |
|------------|:-----:|---------|-------------------------------------------------|
| ObjectPath | да    | —       | Путь к корневому XML или каталогу отчёта        |
| Detailed   | нет   | —       | Подробный вывод (все проверки, включая успешные) |
| MaxErrors  | нет   | 30      | Остановиться после N ошибок                     |
| OutFile    | нет   | —       | Записать результат в файл (UTF-8 BOM)           |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
