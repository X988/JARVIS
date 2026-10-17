> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `meta-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# CommonModule, ScheduledJob, EventSubscription (объекты, привязанные к коду)

## CommonModule (Общий модуль)

Флаги контекста выполнения (все bool, по умолчанию `false`). Создаёт пустой `Ext/Module.bsl`.

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `context` | — | шорткат флагов (см. ниже) |
| `global` | `false` | bool |
| `server` | `false` | bool |
| `serverCall` | `false` | bool (вызов сервера) |
| `clientManagedApplication` | `false` | bool (клиент управляемого приложения) |
| `clientOrdinaryApplication` | `false` | bool (клиент обычного приложения) |
| `externalConnection` | `false` | bool |
| `privileged` | `false` | bool |
| `returnValuesReuse` | `DontUse` | `DontUse` / `DuringRequest` / `DuringSession` |

Шорткат `context`: `"server"` → Server+ServerCall; `"client"` → ClientManagedApplication;
`"serverClient"` → Server+ClientManagedApplication.

```json
{ "type": "CommonModule", "name": "ОбменДаннымиСервер", "context": "server", "returnValuesReuse": "DuringRequest" }
```

## ScheduledJob (Регламентное задание)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `methodName` | пусто | метод-обработчик `"МодульСервер.Процедура"` (дополняется до `CommonModule.…`) |
| `description` | пусто | наименование задания |
| `key` | пусто | ключ |
| `use` | `false` | bool (использование) |
| `predefined` | `false` | bool (предопределённое) |
| `restartCountOnFailure` | `3` | число повторов при сбое |
| `restartIntervalOnFailure` | `10` | интервал повтора, сек |

```json
{ "type": "ScheduledJob", "name": "ОбменДанными", "methodName": "ОбменДаннымиСервер.Выполнить", "use": true }
```

## EventSubscription (Подписка на событие)

| Ключ | Умолчание | Значения |
|------|-----------|----------|
| `source` | `[]` | объекты-источники: `["CatalogObject.Контрагенты", "DocumentObject.Реализация"]` |
| `event` | `BeforeWrite` | `BeforeWrite` / `OnWrite` / `BeforeDelete` / `OnReadAtServer` / `FillCheckProcessing` … |
| `handler` | пусто | метод-обработчик `"МодульСервер.Процедура"` (дополняется до `CommonModule.…`) |

```json
{ "type": "EventSubscription", "name": "ПередЗаписьюКонтрагента",
  "source": ["CatalogObject.Контрагенты"], "event": "BeforeWrite",
  "handler": "ОбщегоНазначенияСервер.ПередЗаписьюКонтрагента" }
```

> Процедура-обработчик (`methodName` / `handler`) должна существовать в указанном общем модуле (экспортная).
