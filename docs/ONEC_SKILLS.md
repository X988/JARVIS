# Пакет навыков 1С (только документация)

Источник: [Nikolay-Shirokov/cc-1c-skills](https://github.com/Nikolay-Shirokov/cc-1c-skills), commit `24429b462509d0ae92e45bc22a7ccae159f7b904`. Лицензия MIT, Copyright (c) 2025-2026 Nick Shirokov. Текст лицензии: `vendor/cc-1c-skills/LICENSE`.

JARVIS копирует тексты навыков и гайды и подаёт подходящие фрагменты в bounded agent как контекст ответа (лексический отбор плюс короткая карточка в `knowledge/1c-skills.md` для основного RAG). Модель не получает новый инструмент, shell или право самой себе выдать approval.

## Что входит

- 81 навык: `vendor/cc-1c-skills/text/skills/<id>/SKILL.md` и соседние справочные markdown.
- Гайды и спецификации XML/DSL из `docs/` апстрима, кроме руководства по портированию скриптов.
- Каталог `vendor/cc-1c-skills/UPSTREAM.json`: commit, лицензия, причина по каждому навыку, пути скриптов, которые не скопированы.

Командные блоки PowerShell/Python/Node и примеры паролей из текстов убраны. В каждом файле есть пометка `JARVIS_ONEC_SKILL_DOCS_ONLY`.

## Что не входит и почему

| Путь апстрима | Почему не подключён |
| --- | --- |
| `.claude/skills/*/scripts/**` | Скрипты PowerShell и Python вызывают конфигуратор, `ibcmd` или переписывают выгрузку. Это не runbook JARVIS и не получает shell. |
| `web-test/scripts/**` | Node/Playwright управляет веб-клиентом 1С, включая сессию и запись экрана. К browser workbench JARVIS не подключён. |
| `hooks/**` | Хуки Claude запускают node на PreToolUse/PostToolUse. |
| `scripts/switch.py` и соседние | Установщик копирует или симлинкует навыки в каталог агента и переключает рантайм. |
| `tests/**` | Тестовый контур апстрима, не знания для оператора. |
| `.v8-xsd/**`, `requirements.txt` | Схемы платформы и зависимости исключённых скриптов. Текст навыка про схемы оставлен, скрипт загрузки нет. |
| `docs/python-porting-guide.md` | Инструкция, как портировать и запускать скрипты навыков. |

Навыки без своих скриптов (`form-patterns`, `db-list` и ещё несколько) тоже только документация: объявленные у апстрима Bash/Write в реестр runbook не добавляются.

Изменение базы, загрузка CF и правка расширения остаются на существующем policy pipeline. Пакет сам по себе ничего не исполняет.

## Настройки

По умолчанию пакет включён. `JARVIS_ONEC_SKILLS=0` отключает подмешивание фрагментов. Каталог и порог: `JARVIS_ONEC_SKILLS_DIR`, `JARVIS_ONEC_SKILLS_TOP_K`, `JARVIS_ONEC_SKILLS_MIN_SCORE` в `.env.example`.
