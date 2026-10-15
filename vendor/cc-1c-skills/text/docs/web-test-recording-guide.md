> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Запись видеоинструкций

Навык `/web-test` умеет записывать видеоинструкции по работе в 1С: автоматические действия в браузере записываются в MP4 с субтитрами, подсветкой элементов и голосовой озвучкой. Результат — готовое обучающее видео.

```
сценарий → запись экрана → субтитры → подсветка → озвучка голосом → MP4
```

## Предусловия

Все пути и настройки хранятся в `.v8-project.json` — см. [справочник формата](v8-project-guide.md).

### ffmpeg (обязательно)

Выберите один из вариантов:

1. **В проект** (рекомендуется) — скачать essentials build с https://www.gyan.dev/ffmpeg/builds/, распаковать в `tools/ffmpeg/`. Код найдёт `tools/ffmpeg/bin/ffmpeg.exe` автоматически

2. **Глобально** — скачать, распаковать в любой каталог, добавить `bin/` в системный PATH

3. **Через конфиг** — указать путь в `.v8-project.json`:
   ```json
   { "ffmpegPath": "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe" }
   ```

### node-edge-tts (для озвучки)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Бесплатный, без API-ключа. Если не установлен — запись видео работает, только озвучка недоступна.

### Конфигурация голоса в `.v8-project.json`

```json
{
  "ffmpegPath": "tools/ffmpeg/bin/ffmpeg.exe",
  "tts": {
    "provider": "edge",
    "voice": "ru-RU-DmitryNeural"
  }
}
```

## Быстрый старт

Минимальный сценарий — запись 3 шагов с озвучкой:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Результат: `recordings/demo-narrated.mp4` — видео с голосовым сопровождением.

## Сценарии использования

### Запись без озвучки

Простейший вариант — субтитры на экране, без голоса:

```
> Запиши видеоинструкцию: открой раздел Продажи, создай заказ клиента,
> заполни организацию и контрагента. Без озвучки
```

Claude запишет видео с субтитрами и подсветкой элементов.

### Запись с озвучкой

Полный pipeline — голос озвучивает каждый шаг:

```
> Запиши озвученную видеоинструкцию по созданию заказа клиента.
> Голос — Светлана
```

Claude запишет видео, затем наложит голосовую дорожку. Субтитры показываются на экране, параллельно звучит голос.

### Переозвучка другим голосом

Видео уже записано — хотите другой голос? Не нужно перезаписывать:

```
> Переозвучь recordings/demo.mp4 голосом Светланы
```

Claude вызовет `addNarration` с другим голосом. Тексты берутся из файла `.captions.json`, который сохраняется рядом с видео при записи.

### Редактирование субтитров

После записи рядом с видео появляется файл `video.captions.json`:

```json
{
  "videoTimestamps": true,
  "captions": [
    { "text": "Переходим в раздел «Продажи»", "speech": "Переходим в раздел Продажи", "time": 3160 },
    { "text": "Открываем заказы клиентов", "speech": "Открываем заказы клиентов", "time": 7040, "voice": "bqbHGIIO5oETYIqhWmfk" }
  ]
}
```

Можно отредактировать `speech` (текст озвучки) или добавить `voice` (голос для конкретной реплики) и переозвучить:

```
> Отредактируй субтитры в recordings/demo.captions.json — замени "Продажи" на
> "раздел Продажи", потом переозвучь
```

## Приёмы

### Титульный слайд

Полноэкранная заставка в начале видео. Поддерживает озвучку через `speech`:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Слайды из презентации

Показать изображение (скриншот слайда, схему и т.д.) как полноэкранный оверлей с озвучкой:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Стили оформления (`style`):
- `'blur'` (по умолчанию) — размытый фон из картинки + тень. Лучший для презентаций
- `'dark'` — тёмный фон + тень
- `'light'` — белый фон + тень
- `'full'` — на весь экран без отступов

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Подсветка элементов

Полупрозрачная рамка на элементе, который сейчас используется. Два режима:

- **Авторежим** — `setHighlight(true)` перед началом действий. Каждая функция (`navigateSection`, `clickElement`, `fillFields` и т.д.) автоматически подсвечивает элемент перед действием
- **Ручная** — `highlight('Провести')` для произвольной подсветки конкретного элемента

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Паузы и ритм

Ритм «субтитр → пауза → действие» даёт зрителю время прочитать, что произойдёт:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Пауза после действия нужна только когда загружается следующая форма:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Два голоса (подкаст / диалог)

Параметр `voice` в `showCaption` задаёт голос для конкретной реплики. `addNarration` автоматически использует его вместо глобального:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Приёмы:
- `showCaption('', { speech, voice })` — пустой текст (без субтитра на экране), но speech записывается для озвучки
- `showImage` со `speech: false` — слайд без озвучки, реплики идут через `showCaption`
- `speechRate: 85` — для ElevenLabs увеличиваем множитель (по умолчанию 70мс/символ), чтобы фразы не наезжали друг на друга

### Разделение текста и озвучки

Параметр `speech` в `showCaption` позволяет показывать одно, а озвучивать другое:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Это полезно для:
- **Бухгалтерских проводок** — на экране формула, голосом — словами
- **Технических данных** — показать, но не зачитывать
- **Информационных плашек** — немой субтитр на несколько секунд

## Доступные голоса и провайдеры

### Какой провайдер выбрать?

| Провайдер | Тембр | Произношение русского | Цена |
|-----------|-------|----------------------|------|
| **Edge TTS** | Синтетичнее | Корректные ударения, правильная артикуляция | Бесплатно |
| **ElevenLabs** | Живее, естественнее | Возможны ошибки в ударениях и артикуляции (напр. «докумЭнт», «крЕдит» вместо «кредИт») | Платно (starter+) |
| **OpenAI** | Зависит от голоса | Зависит от сервиса | Платно |

**Для русскоязычных видеоинструкций рекомендуется Edge TTS** — он бесплатный и даёт надёжное качество русской речи. Голоса DmitryNeural и SvetlanaNeural специально обучены для русского языка: правильно расставляют ударения, корректно артикулируют и делают паузы в нужных местах.

**ElevenLabs** даёт более живой, «человечный» тембр — голос звучит менее синтетически. Однако мультиязычная модель иногда ошибается в произношении русских слов (особенно профессиональная терминология). Если выбираете ElevenLabs для русского контента — берите **professional-голоса** с образовательным или деловым профилем (например, Olga Orlova, Artem), они дают лучший результат, чем англоязычные premade-голоса через мультиязычную модель. Управлять ударениями через API нельзя — фонемные теги (SSML) поддерживаются только для английских моделей.

### Edge TTS (бесплатный) — рекомендуется для русского

| Голос | Описание |
|-------|----------|
| `ru-RU-DmitryNeural` | Мужской, русский — спокойный, деловой |
| `ru-RU-SvetlanaNeural` | Женский, русский — чёткий, уверенный |

Полный список: `en-US-AriaNeural`, `en-US-GuyNeural`, `de-DE-ConradNeural` и другие. Edge TTS поддерживает десятки языков.

Конфигурация не нужна — Edge TTS используется по умолчанию. Для смены голоса:

```json
{
  "tts": {
    "voice": "ru-RU-SvetlanaNeural"
  }
}
```

### ElevenLabs (платный) — живой тембр

Модель `eleven_multilingual_v2` поддерживает русский. Тембр заметно живее, чем у Edge TTS, но возможны артикуляционные ошибки на русской терминологии.

Для русского контента выбирайте **professional-голоса** с образовательным/деловым профилем из Voice Library:

| Голос | ID | Профиль |
|-------|----|---------|
| Olga Orlova | `d60rsXo2p0OwikDR5bS7` | Clear and Engaging |
| Artem | `WTn2eCRCpoFAC50VD351` | Friendly & Professional |
| Denis | `0BcDz9UPwL3MpsnTeUlO` | Pleasant, Engaging and Friendly |
| Alexander | `bqbHGIIO5oETYIqhWmfk` | Pleasant, Warm and Natural |
| Elena Gromova | `0ArNnoIAWKlT4WweaVMY` | Podcasts & Conversation |
| Victor | `9fjVd0EYNNXHllJquVdT` | Moscow accent |

```json
{
  "tts": {
    "provider": "elevenlabs",
    "[credential omitted]
    "voice": "d60rsXo2p0OwikDR5bS7"
  }
}
```

`voice` — ID голоса (не имя). Professional-голоса добавляются в аккаунт через Voice Library в личном кабинете. Требуется платный тариф (starter и выше).

Особенности: лимит на параллельные запросы (2–3 одновременно), система автоматически ограничивает размер пакета.

### OpenAI-compatible (платный)

```json
{
  "tts": {
    "provider": "openai",
    "[credential omitted] omitted]...",
    "voice": "alloy"
  }
}
```

Голоса: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.

Поле `apiUrl` позволяет подключить любой OpenAI-совместимый сервис (например, локальный TTS-прокси).

## Полный пример

Типовая структура озвученного сценария:

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Типичные проблемы

| Проблема | Решение |
|----------|---------|
| `ffmpeg not found` | Установите ffmpeg (см. Предусловия) |
| Файл записи 0 байт | Проверьте права на запись в выходной каталог |
| Видео дёргается | Добавьте `wait()` между шагами |
| `Already recording` | Вызовите `stopRecording()` перед новой записью |
| `No captions available` | Используйте `showCaption()` во время записи |
| TTS timeout | Проверьте интернет-соединение (Edge TTS требует сеть) |
| Озвучка обрезается | Увеличьте паузы `wait()` между субтитрами |
| Фразы наезжают друг на друга | Увеличьте `speechRate` в `startRecording` (85 для ElevenLabs) |

## Связанные навыки

- [Тестирование через веб-клиент](web-test-guide.md) — навигация, формы, таблицы, отчёты
- [Веб-публикация](web-guide.md) — `/web-publish`, `/web-info`, `/web-stop`
