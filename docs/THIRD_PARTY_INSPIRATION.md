# Источники архитектурных идей и лицензии

JARVIS в этом репозитории остаётся самостоятельной реализацией. В текущем проходе исходный код четырёх внешних JARVIS-проектов не копировался: использовались только архитектурные идеи и публично описанное поведение.

| Repository | Проверенная лицензия | Что использовано как идея | Заимствован код | Реализовано самостоятельно |
| --- | --- | --- | --- | --- |
| `jackgladowsky/jarvis` | MIT, Copyright (c) 2026 JARVIS contributors | Telegram по numeric ID, persistent memory/recall, scheduler/history, background workers, Git worktrees, PR/CI watcher, bounded artifact delivery, guarded browser workbench | Нет | Telegram transport, memory categories/search, scheduler controls, worker/job model, worktree policy, artifact guardrails, browser admission |
| `Axx33284/jarvis` | **Явный LICENSE в репозитории не найден** | Voice-first UX, wake word/VAD, local STT/TTS, tool registry, undo journal, fail-closed safety gate | Нет. При неясных правах — только идеи | faster-whisper + Silero VAD, optional Piper TTS, barge-in primitives, Tool Registry поверх runbooks, file-only undo |
| `yontanbe/jarvis` | MIT, Copyright (c) 2026 | Multi-LLM routing, multi-agent modes, RAG/knowledge base, deep research with sources, progress-oriented HUD, MCP layer | Нет | model-routing metadata без роста прав, agent modes, local RAG, source-required research, MCP admission через Gateway |
| `sukeesh/Jarvis` | MIT, Copyright (c) 2017 Sukeesh | Простая plugin architecture и лёгкое добавление capability | Нет | schema-validated manifest с risk/permissions/targets/runbook и без автоматического shell |
| `Nikolay-Shirokov/cc-1c-skills` | MIT, Copyright (c) 2025-2026 Nick Shirokov | Навыки полного цикла разработки 1С:Предприятие 8.3 | Да, только markdown-тексты навыков и гайды, commit `24429b462509d0ae92e45bc22a7ccae159f7b904`. Командные блоки вырезаны. Лицензия: `vendor/cc-1c-skills/LICENSE` | Загрузчик контекста без shell. Скрипты, хуки и установщик не копировались |

## Что сознательно не переносилось

Даже из MIT-проектов не переносились модели, несовместимые с корпоративным control plane:

- `LLM → arbitrary shell → production host`;
- unrestricted Bash/PowerShell;
- model-controlled approvals;
- автоматический push/merge/deploy в `main`;
- production credentials в prompt/context;
- auto-heal от monitoring alert без policy/runbook;
- игры, jokes, cocktails и другие consumer-команды.

Главная архитектура остаётся:

`Client → Authentication → STT → Intent → Constraints → Inventory → Policy → Runbook Registry → Approval → Execution Gateway → Executor → Verification → Audit`.

Внешний plugin, MCP tool, worker, LLM или Telegram client не получает права вызывать executor напрямую.

## Лицензионное решение

MIT разрешает использование, изменение и распространение при сохранении copyright/permission notice в копиях или существенных частях кода.

Для четырёх JARVIS-репозиториев выше код не копировался. Исключение — `cc-1c-skills`: скопированы и отредактированы markdown-тексты. Полный MIT notice лежит в `vendor/cc-1c-skills/LICENSE`, copyright продублирован в каждом файле `text/`. Скрипты этого репозитория не копировались.

Для `Axx33284/jarvis` отсутствие явной лицензии трактуется как отсутствие разрешения на копирование. Используются только общие идеи, реализация написана независимо.

Проверено: 2026-10-07.
