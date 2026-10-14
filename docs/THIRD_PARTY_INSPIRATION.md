# Источники архитектурных идей и лицензии

JARVIS в этом репозитории остаётся самостоятельной реализацией. В текущем проходе исходный код четырёх внешних JARVIS-проектов не копировался: использовались только архитектурные идеи и публично описанное поведение.

| Repository | Проверенная лицензия | Что использовано как идея | Заимствован код | Реализовано самостоятельно |
| --- | --- | --- | --- | --- |
| `jackgladowsky/jarvis` | MIT, Copyright (c) 2026 JARVIS contributors | Telegram по numeric ID, persistent memory/recall, scheduler/history, background workers, Git worktrees, PR/CI watcher, bounded artifact delivery, guarded browser workbench | Нет | Telegram transport, memory categories/search, scheduler controls, worker/job model, worktree policy, artifact guardrails, browser admission |
| `Axx33284/jarvis` | **Явный LICENSE в репозитории не найден** | Voice-first UX, wake word/VAD, local STT/TTS, tool registry, undo journal, fail-closed safety gate | Нет. При неясных правах — только идеи | faster-whisper + Silero VAD, optional Piper TTS, barge-in primitives, Tool Registry поверх runbooks, file-only undo |
| `yontanbe/jarvis` | MIT, Copyright (c) 2026 | Multi-LLM routing, multi-agent modes, RAG/knowledge base, deep research with sources, progress-oriented HUD, MCP layer | Нет | model-routing metadata без роста прав, agent modes, local RAG, source-required research, MCP admission через Gateway |
| `sukeesh/Jarvis` | MIT, Copyright (c) 2017 Sukeesh | Простая plugin architecture и лёгкое добавление capability | Нет | schema-validated manifest с risk/permissions/targets/runbook и без автоматического shell |

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

В этом проходе **код внешних репозиториев не копировался**, поэтому source-level notices для заимствованных фрагментов не требуются. Если позже будет принято решение перенести конкретный MIT-фрагмент, его происхождение и обязательный notice должны быть добавлены до merge.

Для `Axx33284/jarvis` отсутствие явной лицензии трактуется как отсутствие разрешения на копирование. Используются только общие идеи, реализация написана независимо.

Проверено: 2026-10-07.
