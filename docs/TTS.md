# TTS

Серверный локальный TTS поддерживается через Piper.

Настройка:

- `JARVIS_TTS_PROVIDER=piper`
- `JARVIS_TTS_BIN=piper`
- `JARVIS_TTS_MODEL=/absolute/path/to/russian-voice.onnx`
- `JARVIS_TTS_TIMEOUT_MS=30000`
- `JARVIS_TTS_MAX_CHARS=360`
- `JARVIS_TTS_LENGTH_SCALE=1.0`
- `JARVIS_TTS_SENTENCE_SILENCE=0.18`

Модель голоса хранится вне Git. Для русского выбирается совместимая русская Piper-модель.

Pipeline:

`voiceSummary → sanitize → natural sentence boundary → Piper WAV → ffmpeg mono 48 kHz Opus → Telegram sendVoice`.

Длинный ответ не обрезается посреди слова, если можно завершить его на полном предложении. Темп речи и пауза между предложениями задаются серверной конфигурацией Piper.

В голос не попадают URL, markdown, длинные хеши и полные approval-токены. Для опасной операции голос сообщает, что требуется подтверждение, а точная фраза подтверждения остаётся только в текстовом сообщении.

TTS работает как дополнительный канал. Если Piper, модель или ffmpeg недоступны, текстовый ответ всё равно отправляется; pipeline не выдаёт ложный голосовой успех.

`/ready` показывает фактический `tts.ready`, когда Piper явно включён.
