# UX: HUD, голос и screen-input

Добавлено в ветке `feat/ux-hud-screen`. Всё является только клиентом и отображением. Полномочия не меняются.

## HUD
Компонент `src/components/jarvis/hud.tsx` показывает:
- фазу голосового вызова (listening / thinking / speaking / idle);
- эффективный режим исполнения и (при деградации) причину;
- остаток TTL approval;
- уровни микрофона.

Рендерится рядом с `VoiceCall`. Решения не принимает.

## Screen capture (untrusted)
`src/lib/jarvis/screen/capture.ts`

- Включается только флагом `JARVIS_SCREEN_CAPTURE_ENABLED=1` (по умолчанию выключен).
- Использует `getDisplayMedia` после явного действия пользователя.
- Результат (dataUrl) передаётся как обычный untrusted input в существующий pipeline (`/api/agent` или `/api/voice`).
- Не является источником полномочий и не вызывает executor напрямую.
- В аудите помечается каналом `screen`.

## Голос
Клиентские улучшения в `voice-call.tsx`: подготовка к отображению confidence STT и уровней. Серверный STT/TTS и модель безопасности не изменены.

## Режим
UI показывает эффективный режим (результат `effectiveExecutionMode`). Явный режим из канала не может поднять dry-run до real.

## Что не входит
- Прямой контроль приложений/терминала.
- Real-time Gemini Live.
- Изменения Policy, Approval, Gateway или DENY_ALWAYS.
