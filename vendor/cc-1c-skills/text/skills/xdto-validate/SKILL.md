> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `xdto-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация пакета XDTO 1С. Используй после создания или модификации пакета XDTO для проверки корректности


# /xdto-validate — Валидация пакета XDTO

Проверяет модель пакета, объект метаданных и его связь с конфигурацией.
Каждая находка выводится отдельной строкой с объяснением. Exit code `1` при ошибках.

## Параметры

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `PackagePath` | да | Каталог пакета, `Ext/Package.bin` или `<Имя>.xml` объекта метаданных. Псевдоним — `-Path` |
| `ConfigDir` | нет | Корень исходников. По умолчанию определяется по расположению пакета |
| `Detailed` | нет | Показывать успешные проверки, а не только проблемы |
| `MaxErrors` | нет | Остановиться после N ошибок. По умолчанию 20 |
| `OutFile` | нет | Записать отчёт в файл |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

`[ERROR]` — платформа такой пакет не примет либо примет неправильно.
`[WARN]` — пакет рабочий, но есть риск, о котором стоит знать.

## Зачем запускать, если пакет и так грузится

Часть дефектов платформа не диагностирует: неразрешённый тип из чужого пространства
имён она молча подменяет на `xs:anyType`, и пакет выглядит загруженным, пока
`ФабрикаXDTO` не отдаст в рантайме бесструктурное значение. Такие вещи видно только
статически — до загрузки в базу.

## Типичный workflow

1. `/xdto-compile`, `/xdto-edit` или переработка через `/xdto-decompile` → `/xdto-compile -Force`
2. `/xdto-validate <путь>` — до загрузки в базу
3. `/db-load-xml` + `/db-update`
