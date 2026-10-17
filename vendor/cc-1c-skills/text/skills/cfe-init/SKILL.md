> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cfe-init`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Создать расширение конфигурации 1С (CFE) — scaffold XML-исходников. Используй когда нужно создать новое расширение для исправления, доработки или дополнения конфигурации


# /cfe-init — Создание расширения конфигурации 1С

Создаёт scaffold расширения: `Configuration.xml`, язык в `Languages/`, опционально `Roles/`.

## Подготовка

Если есть выгрузка базовой конфигурации, передай `-ConfigPath` — скрипт автоматически возьмёт из базовой конфигурации `CompatibilityMode` и язык.

### Авто-определение ConfigPath

Если пользователь не указал `-ConfigPath` — попробуй определить автоматически:
1. Прочитай `.v8-project.json` из корня проекта
2. Разреши целевую базу (по имени, ветке или `default` — алгоритм из `/db-list`)
3. Если у базы есть поле `configSrc` — используй как `-ConfigPath`
4. Если `configSrc` нет — спроси у пользователя

Если `.v8-project.json` не найден и `-ConfigPath` не задан — расширение создастся с предупреждением (UUID языка = нули, CompatibilityMode по умолчанию).

## Параметры

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `Name` | Имя расширения (обязат.) | — |
| `Synonym` | Синоним | = Name |
| `NamePrefix` | Префикс собственных объектов | = Name + "_" |
| `OutputDir` | Каталог для создания; клади расширение в свой подкаталог, названный по имени: `src\cfe\<Name>` | `src` |
| `Purpose` | `Patch` (исправление) / `Customization` (доработка) / `AddOn` (дополнение) | `Customization` |
| `Version` | Версия расширения | — |
| `Vendor` | Поставщик | — |
| `CompatibilityMode` | Режим совместимости; при заданном `ConfigPath` определяется по базовой конфигурации и этот параметр не нужен | `Version8_3_24` |
| `ConfigPath` | Путь к выгрузке базовой конфигурации (авто-определяет CompatibilityMode и язык) | — |
| `NoRole` | Без основной роли | false |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Верификация

```
/cfe-validate <OutputDir> -ConfigPath <ConfigPath>
```
