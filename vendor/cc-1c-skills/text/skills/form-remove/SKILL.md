> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `form-remove`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Удалить форму из объекта 1С (обработка, отчёт, справочник, документ и др.)


# /form-remove — Удаление формы

Удаляет форму и убирает её регистрацию из корневого XML объекта.

## Usage

```
/form-remove <ObjectName> <FormName>
```

| Параметр   | Обязательный | По умолчанию | Описание                            |
|------------|:------------:|--------------|-------------------------------------|
| ObjectName | да           | —            | Имя объекта                         |
| FormName   | да           | —            | Имя формы для удаления              |
| SrcDir     | нет          | `src`        | Каталог исходников                  |
| Force      | нет          | —            | Удалить, даже если на форму ссылаются, и очистить ссылки |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Что удаляется

```
<SrcDir>/<ObjectName>/Forms/<FormName>.xml     # Метаданные формы
<SrcDir>/<ObjectName>/Forms/<FormName>/         # Каталог формы (рекурсивно)
```

## Что модифицируется

- `<SrcDir>/<ObjectName>.xml` — убирается `<Form>` из `ChildObjects`
- Свойства объекта, указывавшие на удалённую форму — очищаются
