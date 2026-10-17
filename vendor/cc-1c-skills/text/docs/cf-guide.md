> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Корневые файлы конфигурации

Навыки группы `/cf-*` позволяют создавать, анализировать, редактировать и проверять корневые файлы конфигурации 1С — `Configuration.xml`, `ConfigDumpInfo.xml`, `Languages/`.

## Навыки

| Навык | Параметры | Описание |
|-------|-----------|----------|
| `/cf-info` | `<ConfigPath> [-Mode overview\|brief\|full]` | Анализ конфигурации: свойства, состав, счётчики объектов (3 режима) |
| `/cf-init` | `<Name> [-Synonym] [-OutputDir] [-Version] [-Vendor]` | Создание пустой конфигурации (scaffold XML-исходников) |
| `/cf-validate` | `<ConfigPath> [-MaxErrors 30]` | Валидация структурной корректности (8 проверок) |
| `/cf-edit` | `<ConfigPath> -Operation <op> -Value "<val>"` | Редактирование свойств, состава ChildObjects, ролей по умолчанию (6 операций) |

## Рабочий цикл

```
Описание (текст) → /cf-init → XML-исходники → /cf-validate
                                ↕ /cf-edit      → /cf-info
```

1. `/cf-init` создаёт scaffold пустой конфигурации (Configuration.xml, ConfigDumpInfo.xml, Languages/)
2. `/cf-edit` вносит изменения: свойства, объекты в ChildObjects, роли по умолчанию
3. `/cf-validate` проверяет корректность XML (структура, enum-значения, ссылки, каталоги)
4. `/cf-info` выводит компактную сводку для визуальной проверки

## cf-info — режимы вывода

### brief — одна строка

```
Конфигурация: БухгалтерияПредприятия — "Бухгалтерия предприятия" v3.0.181.31 | 2847 объектов | Version8_3_24
```

### overview (по умолчанию) — заголовок + ключевые свойства + счётчики

```
Конфигурация: ТестКонфигурация — "Тестовая конфигурация"
  Version:         2.0.0.1
  Vendor:          TestCompany
  Compatibility:   Version8_3_24
  DefaultLanguage: Language.Русский

Объекты (4 шт.):
  Language            1
  Role                1
  Catalog             1
  Document            1
```

### full — все свойства + полный список объектов

Выводит все свойства по категориям (скалярные, enum, ref), полный список ChildObjects поимённо, DefaultRoles и мобильные функциональности.

## cf-edit — операции

### Свойства

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Поддерживаемые свойства:

| Категория | Свойства |
|-----------|----------|
| Скалярные | `Name`, `Version`, `Vendor`, `Comment`, `NamePrefix`, `UpdateCatalogAddress` |
| LocalString | `Synonym`, `BriefInformation`, `DetailedInformation`, `Copyright`, `VendorInformationAddress`, `ConfigurationInformationAddress` |
| Enum | `CompatibilityMode`, `ConfigurationExtensionCompatibilityMode`, `DefaultRunMode`, `ScriptVariant`, `DataLockControlMode`, `ObjectAutonumerationMode`, `ModalityUseMode`, `SynchronousPlatformExtensionAndAddInCallUseMode`, `InterfaceCompatibilityMode`, `DatabaseTablespacesUseMode`, `MainClientApplicationWindowMode` |
| Ref | `DefaultLanguage` |

### Состав объектов (ChildObjects)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

44 типа объектов поддерживаются в каноническом порядке: Language, Subsystem, StyleItem, CommonPicture, ... IntegrationService.

### Роли по умолчанию (DefaultRoles)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### JSON mode — комбинированные операции

```json
[
  { "operation": "modify-property", "value": "Version=2.0.0.1 ;; Vendor=Test" },
  { "operation": "add-childObject", "value": "Catalog.Товары ;; Document.Заказ" },
  { "operation": "add-defaultRole", "value": "ПолныеПрава" }
]
```

## cf-validate — проверки

| # | Проверка | Уровень |
|---|----------|---------|
| 1 | XML well-formedness, MetaDataObject/Configuration, version | ERROR |
| 2 | InternalInfo: 7 ContainedObject, валидные ClassId | ERROR |
| 3 | Properties: Name, Synonym, DefaultLanguage, DefaultRunMode | ERROR/WARN |
| 4 | Enum-значения (11 свойств) | ERROR |
| 5 | ChildObjects: валидные типы, нет дубликатов, порядок | ERROR/WARN |
| 6 | DefaultLanguage ссылается на существующий Language | ERROR |
| 7 | Файлы языков `Languages/<name>.xml` существуют | WARN |
| 8 | Каталоги объектов из ChildObjects существуют | WARN |

## Сценарии использования

### Обзор существующей конфигурации

```
> Покажи структуру конфигурации C:\WS\cfsrc\acc_8.3.24
```

Claude вызовет `/cf-info` и покажет: имя, синоним, версию, поставщика, количество объектов по типам.

### Создание новой конфигурации

```
> Создай пустую конфигурацию МойПроект, версия 1.0.0.1, поставщик "ООО Ромашка"
```

Claude вызовет `/cf-init` → `/cf-edit` (Version, Vendor) → `/cf-validate` → `/cf-info`.

### Добавление объектов в конфигурацию

```
> Добавь в конфигурацию src/ справочник Контрагенты, документ ЗаказКлиента и перечисление ВидыОплат
```

Claude вызовет `/cf-edit` с `add-childObject`, объекты встанут в каноническом порядке.

### Проверка конфигурации после изменений

```
> Проверь корректность конфигурации src/
```

Claude вызовет `/cf-validate` и покажет ошибки и предупреждения.

## Структура корневых файлов

```
<OutputDir>/
├── Configuration.xml         # Свойства и состав конфигурации
├── ConfigDumpInfo.xml        # Служебный (версии объектов)
├── Ext/                      # Модули конфигурации
│   ├── ManagedApplicationModule.bsl
│   ├── SessionModule.bsl
│   └── ...
└── Languages/
    └── Русский.xml           # Язык конфигурации
```

## Связь с другими навыками

- `/meta-compile` — при создании объекта автоматически регистрирует его в `Configuration.xml` (вызывает логику `add-childObject`)
- `/subsystem-edit` — при добавлении объекта в подсистему объект уже должен быть в ChildObjects
- `/cf-edit` + `/meta-compile` — типичная связка: сначала добавить объект в конфигурацию, затем создать его исходники

## Спецификации

- [1c-configuration-spec.md](1c-configuration-spec.md) — XML-формат Configuration.xml, ConfigDumpInfo.xml, Languages/, свойства, 44 типа ChildObjects
