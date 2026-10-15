> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `v8-xsd-fetch`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Загрузка XSD-схем формата XML-выгрузки 1С по версиям формата в каталог проекта. Используй когда нужно скачать или обновить схемы платформы для проверки выгрузки по XSD, или узнать, какие версии схем доступны


# /v8-xsd-fetch — XSD-схемы платформы

Скачивает XSD-схемы формата выгрузки по версиям формата в каталог схем проекта
(`.v8-xsd` рядом с `.v8-project.json` или путь из его ключа `xsdPath`).

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `-Versions "<список>"` | Версии формата через запятую. Без него — все доступные (около 600 КБ на версию) |
| `-List` | Показать доступные версии и какие уже скачаны, ничего не скачивая |
| `-OutPath <путь>` | Другой каталог схем — только если пользователь его назвал |
| `-Force` | Перекачать уже скачанные файлы |

## Какую версию брать

Версия формата — атрибут `version` корня `Configuration.xml` выгрузки (например, `2.20`), а не номер
релиза платформы. Скачивай версии выгрузок, с которыми работает проект.

Каталог схем в Git не добавляй: если проект — репозиторий, каталог должен быть в `.gitignore`.

Нет сети — сообщи пользователю: схемы можно скопировать вручную из каталогов
`schemas/designer/<версия>/` репозитория https://github.com/yellow-hammer/namespace-forest.
