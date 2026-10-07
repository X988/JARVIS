# TTS

Серверный локальный TTS поддерживается через Piper.

Настройка:

- `JARVIS_TTS_PROVIDER=piper`
- `JARVIS_TTS_BIN=piper`
- `JARVIS_TTS_MODEL=/absolute/path/to/russian-voice.onnx`
- `JARVIS_TTS_TIMEOUT_MS=30000`
- `JARVIS_TTS_MAX_CHARS=360`

Модель голоса хранится вне Git. Для русского выбирается совместимая русская Piper-модель.

Pipeline:

`voiceSummary → sanitize → piper WAV → ffmpeg mono 48 kHz Opus → Telegram sendVoice`.

В голос не попадают URL, markdown, длинные хеши и полные approval-токены. Для опасной операции голос сообщает, что требуется подтверждение, а точная фраза подтверждения остаётся только в текстовом сообщении.

TTS работает как дополнительный канал. Если Piper, модель или ffmpeg недоступны, текстовый ответ всё равно отправляется; pipeline не выдаёт ложный голосовой успех.

`/ready` показывает фактический `tts.ready`, когда Piper явно включён.
