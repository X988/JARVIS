# Голос

Голос только подаёт фразу в существующий контур. Он не подтверждает заявку, не задаёт риск и не собирает shell.

Путь: аудио, VAD, faster-whisper, нормализация по inventory, `/api/commands` pipeline, короткий `voiceSummary` и полный текст.

Тишина, щелчок короче 200 мс и confidence ниже 0.55 в pipeline не уходят.

Переменные: `JARVIS_STT_PROVIDER`, `JARVIS_STT_MODEL=small`, `JARVIS_STT_LANGUAGE=ru`, `JARVIS_STT_DEVICE=auto`, `JARVIS_MODEL_DIR`, `JARVIS_WAKE_WORD_ENABLED`. Веса модели в git не кладутся.

Kokoro для русского не включён: у локальной модели нет приемлемого русского голоса. Пока TTS `ready: false`, оператор видит текст. Браузер может прочитать `voiceSummary`, это не серверный синтез.
