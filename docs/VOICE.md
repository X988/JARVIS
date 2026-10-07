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
