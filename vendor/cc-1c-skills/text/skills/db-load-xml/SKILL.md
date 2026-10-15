> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-load-xml`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Загрузка конфигурации 1С из XML-файлов. Используй когда нужно загрузить конфигурацию из файлов, XML, исходников, LoadConfigFromFiles


# /db-load-xml — Загрузка конфигурации из XML

Загружает конфигурацию в информационную базу из XML-файлов (исходников). Поддерживает полную и частичную загрузку.

## Usage

```
/db-load-xml <configDir> [database]
/db-load-xml src/config dev
/db-load-xml src/config dev -Mode Partial -Files "Catalogs/Номенклатура.xml,Catalogs/Номенклатура/Ext/ObjectModule.bsl"
```

> **Внимание**: полная загрузка **заменяет всю конфигурацию** в базе. Перед выполнением запроси подтверждение у пользователя.

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта и разреши базу:
1. Если пользователь указал параметры подключения (путь, сервер) — используй напрямую
2. Если указал базу по имени — ищи по id / alias / name в `.v8-project.json`
3. Если не указал — сопоставь текущую ветку Git с `databases[].branches`
4. Если ветка не совпала — используй `default`
Платформа — `v8path` найденной записи базы, иначе корневой `v8path`. Не задан ни там, ни там — `-V8Path` не передавай.
Если файла нет — предложи `/db-list add`.
Если использованная база не зарегистрирована — после выполнения предложи добавить через `/db-list add`.
Если в записи базы указан `configSrc` — используй как каталог загрузки по умолчанию.
Для `-Extension` каталог берётся из `extensions[].src` записи базы, если он там указан.

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
| `-ConfigDir <путь>` | да | Каталог XML-исходников |
| `-Mode <режим>` | нет | `Full` (по умолч.) / `Partial` |
| `-Files <список>` | для Partial | Относительные пути файлов через запятую |
| `-ListFile <путь>` | для Partial | Путь к файлу со списком (альтернатива `-Files`) |
| `-Extension <имя>` | нет | Загрузить в расширение |
| `-AllExtensions` | нет | Загрузить все расширения (только полностью; частями — по одному через `-Extension`) |
| `-NoApplyCheck` | нет | Не проверять применимость расширения после загрузки |
| `-Format <формат>` | нет | `Hierarchical` (по умолч.) / `Plain` |
| `-UpdateDB` | нет | После загрузки сразу обновить конфигурацию БД (`/UpdateDBCfg`) |

> `*` — нужен либо `-InfoBasePath`, либо пара `-InfoBaseServer` + `-InfoBaseRef`

### Режимы загрузки

| Режим | Описание |
|-------|----------|
| `Full` | Полная загрузка — замена всей конфигурации из каталога XML |
| `Partial` | Частичная — перечисленные объекты вместе с их дочерними (формы, макеты) и `Ext/` |

> Если в список файлов включить `Configuration.xml`, платформа выполнит **полную загрузку конфигурации**, а не только перечисленных объектов.

### Формат файла списка (listFile)

Файл содержит **относительные пути к файлам** в каталоге выгрузки (один на строку), кодировка **UTF-8 с BOM**:

```
Catalogs/Номенклатура.xml
Catalogs/Номенклатура/Ext/ObjectModule.bsl
Documents/Заказ.xml
Documents/Заказ/Forms/ФормаДокумента.xml
```

## После выполнения

Если `-UpdateDB` не был указан — **предложи выполнить `/db-update`** для применения изменений к БД

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
