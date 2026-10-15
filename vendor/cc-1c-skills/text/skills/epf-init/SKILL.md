> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `epf-init`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Создать пустую внешнюю обработку 1С (scaffold XML-исходников). Используй когда нужно создать новую внешнюю обработку с нуля


# /epf-init — Создание новой обработки

Генерирует минимальный набор XML-исходников для внешней обработки 1С: корневой файл метаданных и каталог обработки.

## Usage

```
/epf-init <Name> [Synonym] [SrcDir] [FormatVersion]
```

| Параметр      | Обязательный | По умолчанию | Описание                                       |
|---------------|:------------:|--------------|------------------------------------------------|
| Name          | да           | —            | Имя обработки (латиница/кириллица)             |
| Synonym       | нет          | = Name       | Синоним (отображаемое имя)                     |
| SrcDir        | нет          | `src`        | Каталог исходников относительно CWD            |
| FormatVersion | нет          | `2.17`       | Версия формата выгрузки — см. ниже              |

`FormatVersion` — **не выше** версии формата платформы, на которой объект будут собирать и открывать:
8.3.24 — `2.17`, 8.3.25 — `2.18`, 8.3.26 — `2.19`, 8.3.27 — `2.20`, 8.5 — `2.21`. Ниже брать можно:
платформа читает свой формат и любой более старый, поэтому дефолт `2.17` подходит для всей линейки
8.3.24 и выше. Для более старых платформ счёт идёт так же, по одной версии на релиз (8.3.23 — `2.16`),
но на них навыки не проверялись — такое значение принимается с предупреждением.

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Дальнейшие шаги

- Добавить форму: `/form-add`
- Добавить макет: `/template-add`
- Добавить справку: `/help-add`
- Собрать EPF: `/epf-build`
