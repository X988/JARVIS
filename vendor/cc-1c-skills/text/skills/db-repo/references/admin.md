> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-repo`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Администрирование хранилища

## create — создать хранилище

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `-NoBind` | Не подключать базу к созданному хранилищу |
| `-AllowConfigurationChanges` | Включить возможность изменения, если конфигурация на поддержке без неё |
| `-ChangesAllowedRule <правило>` | Правило для объектов, изменения которых разрешены поставщиком |
| `-ChangesNotRecommendedRule <правило>` | То же для «изменения не рекомендуются» |

Правила: `ObjectNotEditable`, `ObjectIsEditableSupportEnabled`, `ObjectNotSupported`.

Без `-NoBind` база сразу подключается к созданному хранилищу. Создание — это версия 1.

Для расширения: `-Extension "<Имя>"` и отдельный путь — у расширения своё хранилище.

## add-user — создать пользователя

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Право | Что даёт |
|-------|----------|
| `ReadOnly` | Просмотр |
| `LockObjects` | Захват объектов |
| `ManageConfigurationVersions` | Изменение состава версий |
| `Administration` | Административные функции |

`-RestoreDeletedUser` — восстановить одноимённого удалённого. Если пользователь с таким именем
существует, он **не** будет добавлен. Выполняющий должен иметь административные права.

## copy-users — скопировать пользователей из другого хранилища

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

`-SourcePath`, `-SourceUser`, `-SourcePassword` описывают хранилище-**источник**. Удалённые пользователи
не копируются; существующие не перезаписываются.
