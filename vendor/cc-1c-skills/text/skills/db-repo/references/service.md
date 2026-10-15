> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-repo`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Сервисные операции

## set-label — метка на версию

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Без `-Version` метка ставится на последнюю версию. Несуществующая версия — ошибка.

## optimize — оптимизация хранения

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Оптимизирует хранение данных в хранилище. Операция долгая.

## clear-cache — очистка кеша

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| `-CacheScope` | Что чистит |
|---------------|------------|
| `local` (по умолчанию) | Локальный кеш версий конфигурации |
| `global` | Глобальный кеш версий |
| `db` | Локальную базу данных хранилища |

Пригождается, когда хранилище ведёт себя странно после сбоя сети или отката версии.
