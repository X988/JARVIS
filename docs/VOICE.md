# Голос

Голос — это только вход и удобный канал ответа. Он не является авторизацией, не повышает риск и не подтверждает опасные действия.

Путь команды:

`Telegram/Web audio → ffmpeg mono 16 kHz → audio gate → faster-whisper VAD/STT → normalization → inventory aliases → policy/runbook → executor → verification → text + optional TTS`.

Низкая уверенность, пустой transcript, типичные Whisper hallucinations и команда, состоящая только из wake word, в pipeline не уходят.

Для подтверждений голос говорит только, что требуется заявка. Полная серверная фраза `CONFIRM ...` отправляется текстом, а не диктуется голосом.

Голосовой ответ строится из фактического результата runbook. Для SQL, Mailcow, MikroTik, WireGuard, дисков и server health технические поля преобразуются в короткие русские фразы. При `dry-run` голос явно говорит, что реальное подключение не выполнялось.

Telegram voice:

`OGG/Opus → temporary .ogg → ffmpeg WAV → STT → pipeline → sendMessage → optional Piper → OGG/Opus → sendVoice`.

Если Piper не настроен, текстовый ответ остаётся рабочим. Ошибка TTS не превращает успешную команду в ошибку pipeline.

Временные аудиофайлы находятся только в `JARVIS_AUDIO_DIR` и удаляются после обработки.

## Разговор в браузере

Кнопка с трубкой открывает hands-free режим. Браузер сам ловит конец фразы по тишине, шлёт WAV 16 кГц на `POST /api/voice` и снова слушает после ответа.

- `content-type: audio/wav` — распознавание через тот же faster-whisper (`JARVIS_STT_*`). Новых переменных нет.
- `{ "action": "turn", "text", "request_id" }` — тот же hybrid pipeline, что `/api/agent`: известная команда идёт в policy/runbook, свободная фраза — в Ollama. Голос не передаёт `approval_id` и не произносит `CONFIRM`.
- `{ "action": "speak", "text" }` — одна фраза Piper (`JARVIS_TTS_*`, для русского `ru_RU-irina-medium` в `JARVIS_TTS_MODEL`). Браузер запрашивает фразы по очереди, пока идёт озвучка предыдущей.

Нужны сессия оператора и CSRF, как у `/api/commands`. Режим `EXECUTION_MODE` не переключается из браузера. Голосовой канал не вызывает исполнителя: чтение в `dry-run` объясняется как dry-run, в `real` голос просит повторить команду текстом. Изменение по-прежнему создаёт заявку; подтверждение только текстом в диалоге. Прерывание, выключение микрофона и выход не подтверждают действие.
