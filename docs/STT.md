# STT

Провайдер: `scripts/jarvis_stt.py` и `FasterWhisper` через `transcribeWav`. Модель по умолчанию multilingual `small`, не `small.en`.

`JARVIS_STT_DEVICE=auto` пробует CUDA и при ошибке остаётся на CPU int8. Нет модуля или каталога модели: `NOT_CONFIGURED`, процесс не падает.

ffmpeg, если вход не WAV, вызывается только с фиксированными аргументами: mono, 16 kHz. Путь файла должен лежать в `JARVIS_AUDIO_DIR`.

Лимиты: 8 МБ и 30 секунд. Временные файлы удаляются после распознавания и вычищаются старше часа.
