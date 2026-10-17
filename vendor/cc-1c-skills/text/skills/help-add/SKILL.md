> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `help-add`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Добавить встроенную справку к объекту 1С (обработка, отчёт, справочник, документ и др.). Используй когда пользователь просит добавить справку, help, встроенную помощь к объекту


# /help-add — Добавление справки

Добавляет встроенную справку к объекту: файл метаданных `Help.xml`, HTML-страницу и при необходимости обновляет метаданные форм.

## Usage

```
/help-add <ObjectName> [Lang] [SrcDir]
```

| Параметр   | Обязательный | По умолчанию | Описание                            |
|------------|:------------:|--------------|-------------------------------------|
| ObjectName | да           | —            | Путь объекта относительно SrcDir (например `Catalogs/МойСправочник`, `DataProcessors/МояОбработка`) |
| Lang       | нет          | `ru`         | Код языка справки                   |
| SrcDir     | нет          | `src`        | Каталог исходников                  |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Что делает скрипт

- Создаёт `Ext/Help.xml` и `Ext/Help/ru.html` — шаблон справки
- Если у объекта есть формы — добавляет `<IncludeHelpInContents>` в метаданные форм (если отсутствует)
- Справка **не регистрируется** в `ChildObjects` — достаточно наличия файлов

## После запуска

Отредактируй `Ext/Help/ru.html` — наполни содержимым справки (стандартный HTML: `<h1>`..`<h4>`, `<p>`, `<ul>`, `<table>` и т.д.). Кнопка справки появится автоматически через `Autofill` в AutoCommandBar формы.
