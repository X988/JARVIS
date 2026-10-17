> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-create`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Создание информационной базы 1С. Используй когда нужно создать базу, новую ИБ, пустую базу


# /db-create — Создание информационной базы

Создаёт новую информационную базу 1С (файловую или серверную) и предлагает зарегистрировать в `.v8-project.json`.

## Usage

```
/db-create <path>                   — файловая база по указанному пути
/db-create <server>/<name>          — серверная база
/db-create                          — интерактивно
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Платформа — `v8path` записи создаваемой базы,
если она уже в реестре, иначе корневой `v8path`. Не задан ни там, ни там — `-V8Path` не передавай.
После создания базы предложи зарегистрировать через `/db-list add`.

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-InfoBasePath <путь>` | * | Путь к файловой базе |
| `-InfoBaseServer <сервер>` | * | Сервер 1С (для серверной базы) |
| `-InfoBaseRef <имя>` | * | Имя базы на сервере |
| `-UseTemplate <файл>` | нет | Создать из шаблона (.cf или .dt) |
| `-AddToList` | нет | Добавить в список баз 1С |
| `-ListName <имя>` | нет | Имя базы в списке |

> `*` — нужен либо `-InfoBasePath`, либо пара `-InfoBaseServer` + `-InfoBaseRef`

## После создания

Предложи зарегистрировать базу в `.v8-project.json` (через `/db-list add`)
3. Если указан шаблон `/UseTemplate` — предупреди что конфигурация будет загружена из шаблона

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
