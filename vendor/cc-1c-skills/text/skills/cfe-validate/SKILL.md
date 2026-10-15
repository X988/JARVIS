> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cfe-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация расширения конфигурации 1С (CFE). Используй после создания или модификации расширения для проверки корректности


# /cfe-validate — валидация расширения конфигурации (CFE)

Проверяет структурную корректность расширения: XML-формат, свойства, состав, заимствованные объекты, права ролей. Аналог `/cf-validate`, но для расширений.

Проверяются исходники. Применимость — уже после загрузки в базу: `/db-cfe-admin check`.

## Параметры

| Параметр      | Обяз. | Умолч. | Описание                                        |
|---------------|:-----:|---------|-------------------------------------------------|
| ExtensionPath | да    | —       | Путь к каталогу или Configuration.xml расширения |
| ConfigPath    | нет   | —       | Каталог конфигурации, из которой заимствованы объекты |
| Detailed      | нет   | —       | Подробный вывод (все проверки, включая успешные)  |
| MaxErrors     | нет   | 30      | Остановиться после N ошибок                      |
| OutFile       | нет   | —       | Записать результат в файл                        |

### ConfigPath

Указывай всегда, когда конфигурация-источник доступна: без неё часть ошибок заимствованных форм не ловится, и расширение может пройти валидацию, а потом быть отвергнутым платформой при загрузке.

Если пользователь не указал путь — определи сам:
1. Прочитай `.v8-project.json` из корня проекта
2. Разреши целевую базу (по имени, ветке или `default`)
3. Возьми её поле `configSrc`

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
