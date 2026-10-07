# Telegram

Вход только по числовому id из `JARVIS_TELEGRAM_ACTORS_JSON`: id → actorId и role. `JARVIS_TELEGRAM_IDS` и список `OPERATORS` права не дают. Username не является личностью. Чужой id получает `ACTOR_DENIED` до скачивания файла.

Голос: `getFile`, скачать OGG, ffmpeg в mono 16 кHz WAV, распознать, передать тот же `processCommand`, ответить `sendMessage`. Webhook: `POST /api/telegram` и заголовок `X-Telegram-Bot-Api-Secret-Token`. Без `JARVIS_TELEGRAM_TOKEN` Bot API не вызывается.

Токен бота и webhook secret только в окружении. В репозитории их нет. Без `TELEGRAM_BOT_TOKEN` приём апдейта можно проверить тестом, исходящий Bot API не вызывается.
