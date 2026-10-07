# STT

Основной провайдер: `faster-whisper` через `scripts/jarvis_stt.py` и `transcribeWav`.

По умолчанию рекомендуется multilingual `small`; для более мощного GPU можно использовать более крупную multilingual-модель. Англоязычные `.en` модели для русского не подходят.

Распознавание настроено для коротких русских инфраструктурных команд:

- beam search, по умолчанию `beam_size=5`;
- Silero VAD внутри faster-whisper;
- `condition_on_previous_text=false` для независимых коротких команд;
- domain prompt с `UTP`, `Mailcow`, `MikroTik`, `WireGuard`, `SQL`, `1С`;
- speech/no-speech threshold;
- duration-weighted confidence;
- fail-closed language gate: уверенно распознанный неожиданный язык не превращается в команду;
- дополнительная нормализация распространённых ошибок распознавания по inventory и инфраструктурным терминам SQL, 1С, DC01, SRV1C01, SQL01, RB5009.

Ключевые параметры:

- `JARVIS_STT_PROVIDER=faster-whisper`
- `JARVIS_STT_MODEL=small`
- `JARVIS_STT_LANGUAGE=ru`
- `JARVIS_STT_DEVICE=auto|cpu|cuda`
- `JARVIS_STT_BEAM_SIZE=5`
- `JARVIS_STT_VAD_SILENCE_MS=500`
- `JARVIS_STT_VAD_PAD_MS=200`
- `JARVIS_STT_NO_SPEECH_THRESHOLD=0.65`
- `JARVIS_STT_MIN_CONFIDENCE=0.55`
- `JARVIS_STT_LANGUAGE_MIN_CONFIDENCE=0.55`
- `JARVIS_STT_PROMPT=...`
- `JARVIS_STT_TIMEOUT_MS=90000`
- `JARVIS_MODEL_DIR=./models`

`JARVIS_STT_DEVICE=auto` пробует CUDA и при невозможности использует CPU int8. Явно запрошенный CUDA fail-closed, если CUDA недоступна.

Входной Telegram OGG конвертируется фиксированными аргументами ffmpeg в mono PCM 16 kHz WAV. Максимальный вход — 8 МБ, максимальная длительность по умолчанию — 30 секунд.

STT-модель и веса не хранятся в Git.
