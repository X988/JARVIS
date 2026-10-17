> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `db-repo`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Подключение базы к хранилищу

## connect — подключить

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `-ForceReplaceCfg` | Конфигурация базы непустая — подтвердить замену её конфигурацией из хранилища. **Спроси подтверждение у пользователя** |
| `-ForceBindAlreadyBindedUser` | Подключить, даже если у этого пользователя уже есть конфигурация, связанная с хранилищем |

На пустой базе `-ForceReplaceCfg` не нужен.

**Переподключение** базы, которая уже была подключена, требует обоих флагов: конфигурация в базе
не пустая (`-ForceReplaceCfg`), а за пользователем хранилища всё ещё числится эта база
(`-ForceBindAlreadyBindedUser`).

После подключения добавь `repository` в запись базы в `.v8-project.json` — иначе остальные
подкоманды придётся каждый раз звать с явными реквизитами, а `update` откажется работать.

## disconnect — отключить

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**Спроси подтверждение у пользователя.** Отключение снимает связь и на стороне самого хранилища:
запись о подключении удаляется. Подключить базу обратно можно, но это уже не рядовая операция —
понадобятся оба флага `connect` из раздела выше.

Если в базе есть захваченные и изменённые объекты, операция не выполнится. `-Force` выполняет её
всё равно, и эти изменения теряются.

## Расширения

У расширения своё хранилище: `-Extension "<Имя>"` указывай вместе с путём именно к нему, а не
к хранилищу основной конфигурации.
