> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `erf-build`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Собрать внешний отчёт 1С (ERF) из XML-исходников. Используй когда пользователь просит собрать, скомпилировать отчёт или получить ERF файл из исходников


# /erf-build — Сборка отчёта

## Usage

```
/erf-build <ReportName> [SrcDir] [OutDir]
```

| Параметр   | Обязательный | По умолчанию | Описание                             |
|------------|:------------:|--------------|--------------------------------------|
| ReportName | да           | —            | Имя отчёта (имя корневого XML)       |
| SrcDir     | нет          | `src`        | Каталог исходников                   |
| OutDir     | нет          | `build`      | Каталог для результата               |

## Параметры подключения (опционально)

Предпочтительно использовать конкретную базу: сборка надёжнее, а `configSrc` базы из
`.v8-project.json` даёт проверке исходников общие модули конфигурации.

1. Прочитай `.v8-project.json` из корня проекта и разреши базу:
2. Если пользователь указал параметры подключения (путь, сервер) — используй напрямую
3. Если указал базу по имени — ищи по id / alias / name в `.v8-project.json`
4. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
5. Если ветка не совпала — используй `default`
6. Если `.v8-project.json` нет или база не найдена — не указывай параметры подключения: скрипт автоматически создаст временную базу. Для ERF со ссылочными типами (CatalogRef, DocumentRef и т.д.) генерируются заглушки метаданных. Временная база удаляется после сборки.

Платформа — `v8path` найденной записи базы, иначе корневой `v8path`. Не задан ни там, ни там — `-V8Path` не передавай.
Если использованная база не зарегистрирована — после выполнения предложи добавить через `/db-list add`.

## Команда

Используй общий скрипт из epf-build:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-InfoBasePath <путь>` | * | Файловая база |
| `-InfoBaseServer <сервер>` | * | Сервер 1С (для серверной базы) |
| `-InfoBaseRef <имя>` | * | Имя базы на сервере |
| `-UserName <имя>` | нет | Имя пользователя |
| `-Password <пароль>` | нет | Пароль |
| `-SourceFile <путь>` | да | Путь к корневому XML-файлу исходников |
| `-OutputFile <путь>` | да | Путь к выходному ERF-файлу |
| `-Checks <список>` | нет | Что проверить перед сборкой: `modules`, `handlers`, `unreferenced`, `empty-handlers`, `config`; `off` — не проверять. По умолчанию `modules,handlers` |
| `-Context <список>` | нет | Контексты проверки `modules`: `ThinClient`, `Server`, `ExternalConnection`, `ThickClientOrdinaryApplication`. По умолчанию `ThinClient,Server` |
| `-ConfigSrc <путь>` | нет | Каталог XML-выгрузки конфигурации, в которой будет работать отчёт. По умолчанию — `configSrc` указанной базы из `.v8-project.json` |

> `*` — опционально. Если не указано — автоматически создаётся временная база со заглушками метаданных

## Проверка перед сборкой

Перед сборкой платформа проверяет исходники: синтаксис модулей и наличие обработчиков форм.
Если есть ошибки, файл не создаётся, а в выводе — сообщение платформы со строкой и колонкой
и путь к файлу исходника. Собрать без проверки — `-Checks off`.

Если код обращается к общим модулям конфигурации (`ОбщегоНазначения`, `УправлениеПечатью` и т.п.),
проверке нужна выгрузка этой конфигурации. По умолчанию берётся `configSrc` указанной базы из
`.v8-project.json`; если его нет — передай каталог выгрузки в `-ConfigSrc`, а если выгрузки нет
совсем — собирай с `-Checks off`. Код, который вызывает методы глобальных общих модулей без
имени модуля, проверку не пройдёт и с выгрузкой — его тоже собирай с `-Checks off`.

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
