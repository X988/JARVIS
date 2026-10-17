> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `subsystem-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация подсистемы 1С. Используй после создания или модификации подсистемы для проверки корректности


# /subsystem-validate — валидация подсистемы 1С

Проверяет структурную корректность XML-файла подсистемы из выгрузки конфигурации.

## Параметры

| Параметр      | Обяз. | Умолч. | Описание                                  |
|---------------|:-----:|---------|--------------------------------------------|
| SubsystemPath | да    | —       | Путь к XML-файлу подсистемы                |
| Detailed      | нет   | —       | Подробный вывод (все проверки, включая успешные) |
| MaxErrors     | нет   | 30      | Остановиться после N ошибок                |
| OutFile       | нет   | —       | Записать результат в файл                  |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
