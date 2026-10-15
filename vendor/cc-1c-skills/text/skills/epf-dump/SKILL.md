> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `epf-dump`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Разобрать EPF-файл обработки 1С (EPF/ERF) в XML-исходники. Используй когда пользователь просит разобрать, декомпилировать обработку, получить исходники из EPF/ERF файла


# /epf-dump — Разборка обработки

## Usage

```
/epf-dump <EpfFile> [OutDir]
```

| Параметр | Обязательный | По умолчанию | Описание                            |
|----------|:------------:|--------------|-------------------------------------|
| EpfFile  | да           | —            | Путь к EPF-файлу                    |
| OutDir   | нет          | `src`        | Каталог для выгрузки исходников     |

## Параметры подключения (обязательно)

Для разборки EPF/ERF требуется информационная база с конфигурацией. Без базы ссылочные типы безвозвратно теряются.

1. Прочитай `.v8-project.json` из корня проекта и разреши базу:
2. Если пользователь указал параметры подключения (путь, сервер) — используй напрямую
3. Если указал базу по имени — ищи по id / alias / name в `.v8-project.json`
4. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
5. Если ветка не совпала — используй `default`
6. Если `.v8-project.json` нет или база не найдена — **сообщи пользователю об ошибке**. Для dump база обязательна: в пустой базе ссылочные типы (CatalogRef, DocumentRef и т.д.) безвозвратно сбрасываются в строки. Предложи указать базу или зарегистрировать через `/db-list add`.

Платформа — `v8path` найденной записи базы, иначе корневой `v8path`. Не задан ни там, ни там — `-V8Path` не передавай.
Если использованная база не зарегистрирована — после выполнения предложи добавить через `/db-list add`.

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-InfoBasePath <путь>` | * | Файловая база |
| `-InfoBaseServer <сервер>` | * | Сервер 1С (для серверной базы) |
| `-InfoBaseRef <имя>` | * | Имя базы на сервере |
| `-UserName <имя>` | нет | Имя пользователя |
| `-Password <пароль>` | нет | Пароль |
| `-InputFile <путь>` | да | Путь к EPF/ERF-файлу |
| `-OutputDir <путь>` | да | Каталог для выгрузки исходников |
| `-Format <формат>` | нет | `Hierarchical` (по умолч.) / `Plain` |

> `*` — обязательно хотя бы одно подключение. Без базы скрипт завершится с ошибкой (dump в пустой базе безвозвратно теряет ссылочные типы)

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
