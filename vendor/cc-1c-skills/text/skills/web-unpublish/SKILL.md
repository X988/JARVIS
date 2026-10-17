> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `web-unpublish`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Удаление веб-публикации 1С из Apache. Используй когда пользователь просит убрать публикацию, удалить веб-доступ к базе


# /web-unpublish — Удаление веб-публикации 1С из Apache

Удаляет блок публикации из `httpd.conf` и каталог `publish/{appname}` внутри Apache. Если других публикаций не осталось — удаляет глобальный блок 1C и останавливает Apache. С флагом `--all` удаляет все публикации разом.

> **Внимание:** этот навык управляет только веб-публикациями в Apache (блоки в `httpd.conf` + каталог `publish/`). Он **НЕ** удаляет каталоги проекта, `upload/`, базы данных или исходники.

## Usage

```
/web-unpublish <appname>
/web-unpublish bpdemo
/web-unpublish --all
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Если задан `webPath` — используй как `-ApachePath`.
По умолчанию `tools/apache24` от корня проекта.

Если пользователь не указал `appname` и не указал `--all`, выполни `/web-info` чтобы показать список публикаций и спроси какую удалить.

Если пользователь просит удалить **все** публикации — используй `-All`.

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-AppName <имя>` | * | Имя публикации |
| `-All` | * | Удалить все публикации |
| `-ApachePath <путь>` | нет | Корень Apache (по умолчанию `tools/apache24`) |

> `*` — нужен либо `-AppName`, либо `-All`

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
