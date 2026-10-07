# Telegram

Вход только по числовому id из `JARVIS_TELEGRAM_ACTORS_JSON`: id → actorId и role. `JARVIS_TELEGRAM_IDS` и список `OPERATORS` права не дают. Username не является личностью. Чужой id получает `ACTOR_DENIED` до скачивания файла.

## Text

По умолчанию текст проходит существующий deterministic `processCommand`.

Если сервер явно включает:

```env
JARVIS_AI_AGENT_ENABLED=1
```

текст проходит hybrid router:

```text
Telegram actor
  → deterministic safety classification
  → known/dangerous command → processCommand / Policy / Approval
  → unknown natural-language request → LLM planner
  → Tool Registry + Inventory
  → read-only server gateway
  → Verification + Audit
```

Известные опасные команды не передаются LLM. AI не может самостоятельно сформировать approval или вызвать mutating executor. Если модель предлагает изменение, исходный пользовательский текст должен независимо пройти обычный command pipeline.

Reply/forward metadata и вложения не становятся authority. Вложения сохраняются только как untrusted references и не исполняются как команды.

## Voice

Голос: `getFile`, скачать OGG, ffmpeg в mono 16 kHz WAV, распознать и передать существующему `processCommand`, затем ответить через `sendMessage`. Голосовой путь пока намеренно не переключён на AI hybrid runtime.

Webhook: `POST /api/telegram` и заголовок `X-Telegram-Bot-Api-Secret-Token`.

Токен бота `JARVIS_TELEGRAM_TOKEN` и `JARVIS_TELEGRAM_WEBHOOK_SECRET` хранятся только в environment/secret store. Без `JARVIS_TELEGRAM_TOKEN` исходящий Bot API не вызывается.
