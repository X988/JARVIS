# Руководство по установке и эксплуатации JARVIS

Документ описывает запуск, первичную настройку, безопасную проверку и обслуживание репозитория [X988/JARVIS](https://github.com/X988/JARVIS).

> **Текущий статус: pre-production.** Успешная установка или зелёные тесты не подтверждают работоспособность интеграций с реальными серверами. Сначала используйте `EXECUTION_MODE=dry-run`, тестовые цели и read-only сценарии.

## 1. Что такое JARVIS

JARVIS — серверный control plane для задач системного администрирования и разработки. Он объединяет веб-интерфейс/PWA, Telegram, голосовой ввод, память, планировщик, coding workers, RAG и инфраструктурные адаптеры.

Команда проходит серверную цепочку:

```text
Клиент → Authentication → Intent → Inventory → Policy
→ Runbook → Approval (если требуется) → Gateway → Executor
→ Verification → Audit
```

Модель, браузер и Telegram не получают прямого доступа к произвольной shell-команде. Наличие адаптера в коде не означает, что он настроен или проверен на реальном сервере.

## 2. Требования

Базовый локальный запуск:

- Git;
- Node.js 24;
- npm;
- доступ к репозиторию.

Дополнительно, только если соответствующая функция нужна:

- `ffmpeg` — voice/E2E сценарии;
- Python и faster-whisper либо настроенный whisper.cpp wrapper — STT;
- Piper и локальная voice model — TTS;
- реальные учётные данные и сетевой доступ — интеграционные проверки конкретных адаптеров.

## 3. Получение кода и запуск

```bash
git clone https://github.com/X988/JARVIS.git
cd JARVIS
npm ci
cp .env.example .env
```

Откройте `.env` и оставьте безопасный режим:

```env
EXECUTION_MODE=dry-run
JARVIS_AI_AGENT_ENABLED=0
```

Запустите dev-сервер:

```bash
npm run dev
```

Обычно интерфейс доступен по адресу `http://localhost:8080`. Используйте адрес, который выводит сам dev-сервер, если порт отличается.

Не включайте `EXECUTION_MODE=real` только ради проверки запуска. Для обычной разработки и изучения интерфейса это не требуется.

## 4. Вход и создание первого администратора

Веб-вход использует Better Auth. Регистрация новых аккаунтов **по умолчанию закрыта**: её нужно временно открыть `JARVIS_EMAIL_SIGNUP=1`, создать учётки и снова закрыть. Регистрация аккаунта сама по себе **не выдаёт права оператора**: доступ определяется серверной картой `JARVIS_WEB_ACTORS_JSON`.

Для постоянного LAN/HTTPS-развёртывания задайте в окружении процесса как минимум:

```env
VITE_AUTH_ENABLED=true
BETTER_AUTH_URL=https://<адрес-хоста>:<порт>
BETTER_AUTH_SECRET=<постоянный-секрет>
JARVIS_PGLITE_DIR=./data/pglite
# только на время создания учёток:
JARVIS_EMAIL_SIGNUP=1
EXECUTION_MODE=dry-run
```

Сгенерировать секрет можно командой:

```bash
openssl rand -hex 32
```

Правила настройки:

1. `BETTER_AUTH_URL` должен совпадать с origin в адресной строке браузера: схема HTTPS, имя/IP и порт, без пути.
2. Для LAN используйте HTTPS через настроенный reverse proxy, например Caddy. Cookie с префиксом `__Host-` и флагом `Secure` не работает как обычная сессионная cookie по голому HTTP.
3. `BETTER_AUTH_SECRET` должен оставаться постоянным между перезапусками.
4. Если `DATABASE_URL` не задан, для постоянного хранения аккаунтов настройте `JARVIS_PGLITE_DIR`. Без него PGLite работает в памяти, и данные теряются при перезапуске.
5. Процессное окружение может переопределять значения из `.grok/app-env.json`. Проверьте, что `VITE_AUTH_ENABLED` не отключён.

### Назначение прав

1. Запустите приложение и откройте `/login`.
2. Зарегистрируйте учётную запись.
3. Если консоль показывает `ACTOR_DENIED`, скопируйте показанный Better Auth user ID.
4. Добавьте этот ID в серверное окружение:

```env
JARVIS_WEB_ACTORS_JSON={\"<user-id>\":{\"actorId\":\"admin1\",\"role\":\"operator\"}}
```

5. Перезапустите сервер и проверьте вход.
6. После создания нужных аккаунтов закройте публичную регистрацию: уберите `JARVIS_EMAIL_SIGNUP` (по умолчанию регистрация закрыта) или задайте явно:

```env
JARVIS_EMAIL_SIGNUP=0
```

Роль `operator` даёт доступ к консоли, но не отменяет policy, ограничения runbook и требования approval. Не добавляйте произвольные роли, не подтверждённые реализацией. Для просмотра пользователей предусмотрена команда:

```bash
npm run users:web
```

Для запуска этой команды с внешней БД или PGLite каталог/доступ к базе должны соответствовать запущенному приложению; иногда процесс JARVIS требуется остановить, если файл базы занят.

## 5. Переменные окружения и секреты

Полный перечень переменных находится в:

- `.env.example`;
- `config/jarvis/env.schema.json`.

Основные группы:

| Назначение | Префиксы/переменные |
|---|---|
| Режим исполнения | `EXECUTION_MODE` |
| Веб-аутентификация | `VITE_AUTH_ENABLED`, `BETTER_AUTH_*`, `JARVIS_EMAIL_SIGNUP`, `JARVIS_PGLITE_DIR` |
| Права веб-пользователей | `JARVIS_WEB_ACTORS_JSON` |
| Telegram | `JARVIS_TELEGRAM_*` |
| LLM/AI agent | `JARVIS_AI_AGENT_ENABLED`, `JARVIS_LLM_*`, настройки выбранного provider |
| Windows/SSH/SQL/MikroTik/Mailcow | `JARVIS_WINDOWS_*`, `JARVIS_SSH_*`, `JARVIS_SQL_*`, `JARVIS_MIKROTIK_*`, `JARVIS_DOCKER_*` |
| 1С | `JARVIS_ONEC_*`, настройки фиксированных validator wrappers |
| STT/TTS | `JARVIS_STT_*`, `JARVIS_TTS_*` |
| Мониторинг и аудит | `JARVIS_PROMETHEUS_*`, `JARVIS_ZABBIX_*`, `JARVIS_ALERTMANAGER_*`, `JARVIS_AUDIT_*` |

Не коммитьте `.env`, API keys, пароли, SSH-ключи, bot tokens, дампы 1С или реальные конфигурации инфраструктуры. Перед публикацией запускайте `npm run security:secrets`.

## 6. Настройка AI agent

AI agent отключён по умолчанию. Для его включения требуется явно задать:

```env
JARVIS_AI_AGENT_ENABLED=1
```

Затем нужно настроить выбранного провайдера в соответствии с `.env.example`: OpenAI, Anthropic, Gemini или локальный Ollama. Необходимо явно выбрать provider/model; не предполагайте, что провайдер определяется автоматически.

Endpoint агента: `POST /api/agent`.

Ключевое ограничение: автономный agent loop может исполнять только зарегистрированные runbooks с `risk=0`, `mutates=false` и `policy=ALLOW`. Изменяющие операции должны останавливаться с требованием approval и проходить обычный серверный pipeline. Голос не является фактором аутентификации или подтверждения.

## 7. Интеграции и инвентарь

Inventory и реестр runbooks задают допустимые цели и операции. Перед настройкой адаптера изучите:

- `config/jarvis/inventory.json`;
- `config/jarvis/env.schema.json`;
- `docs/ARCHITECTURE.md`;
- `docs/THREAT_MODEL.md`;
- соответствующий документ в `docs/`.

Важные различия статусов:

- `NOT_CONFIGURED` — обязательная конфигурация отсутствует;
- `CREDENTIAL_UNAVAILABLE` — не хватает учётных данных;
- `ADAPTER_DISABLED` — runtime или клиент интеграции недоступен/отключён;
- `CONFIGURED_UNPROBED` — параметры заданы, но живое соединение не проверено;
- `HEALTHY` — успешная проверка в рамках конкретного health probe.

Не трактуйте `CONFIGURED_UNPROBED` как подтверждение работоспособности. Для SSH оставляйте строгую проверку host key; неизвестные ключи нельзя автоматически принимать. Для RouterOS используйте HTTPS и проверку сертификата. Не отключайте TLS-проверку через `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Для 1С разрешён development/test workflow с выгрузками и валидаторами. Production upload/CF load и динамический `Выполнить()` остаются запрещёнными.

## 8. Проверки перед изменениями

Перед коммитом или PR выполните:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run coverage
npm run security:secrets
npm run security:audit
npm run build
npm run e2e
```

Не пропускайте тесты, чтобы скрыть ошибку. Если команда завершается неуспешно, сохраните полный вывод и выясните причину. Не используйте `npm audit fix --force` без проверки совместимости зависимостей.

Миграции запускаются отдельно:

```bash
npm run db:migrate
```

Сборка сама по себе не применяет миграции. Перед миграцией на любой базе данных сделайте и проверьте резервную копию.

## 9. Linux-запуск

Для базовой проверки сборки на Linux:

```bash
npm ci
npm run build
npm run db:migrate
EXECUTION_MODE=dry-run npm run start:linux
```

Согласно README, `start:linux` слушает `0.0.0.0:8080`. Это может сделать порт доступным по сети, поэтому настройте firewall и reverse proxy, не публикуйте приложение в интернет без TLS и корректной аутентификации.

Для постоянной эксплуатации отдельно настройте управление процессом, TLS, резервное копирование, логи, обновление и rollback. Не считайте приведённый запуск полноценной production-инструкцией.

## 10. Диагностика типичных проблем

| Симптом | Что проверить |
|---|---|
| `ACTOR_DENIED` | Добавлен ли точный Better Auth user ID в `JARVIS_WEB_ACTORS_JSON`; перезапущен ли сервер |
| Не удаётся войти после перезапуска | Постоянен ли `BETTER_AUTH_SECRET`; сохраняется ли PGLite/Postgres |
| Cookie не сохраняется в браузере | HTTPS, соответствие `BETTER_AUTH_URL` реальному origin, reverse proxy headers |
| `NOT_CONFIGURED` | Наличие обязательных переменных и корректность inventory target |
| `CREDENTIAL_UNAVAILABLE` | Настроены ли необходимые credentials/secret files; не попали ли они в пустые значения |
| `CONFIGURED_UNPROBED` | Адаптер ещё не прошёл реальный health probe |
| `ADAPTER_DISABLED` | Доступен ли требуемый локальный runtime/client и включена ли интеграция |
| AI agent не выполняет изменяющую операцию | Это ожидаемое ограничение: mutating runbooks требуют обычного approval pipeline |
| Миграция не изменила схему | Проверьте `DATABASE_URL`, журналы команды и используемую базу; build миграции не запускает |
| Тесты voice падают | Установлен ли `ffmpeg` и доступны ли требуемые локальные модели/обёртки |

## 11. Безопасность и запреты

Независимо от запроса LLM, нельзя обходить серверную policy. Среди ограничений проекта:

- произвольная shell-команда на production;
- прямой push в `main/master`;
- автоматический merge/deploy production coding worker-ом;
- production database drop;
- uncontrolled production 1С load и `onec.exec`;
- подмена actor, target, runbook, risk, policy или approval из клиентского JSON;
- исполнение неизвестных MCP tools/plugins;
- self-heal без явной policy и зарегистрированного runbook.

Не переводите `EXECUTION_MODE` в `real`, не добавляйте production credentials и не подключайте реальные цели, пока не проверены policy, inventory, runbooks, approvals, audit, rollback и интеграционные тесты. Голосовая команда и Telegram-сообщение не заменяют подтверждение личности.

## 12. Дополнительная документация

- [Архитектура](ARCHITECTURE.md)
- [Модель угроз](THREAT_MODEL.md)
- [Чек-лист релиза](RELEASE_CHECKLIST.md)
- [Резервное копирование](BACKUP.md)
- [Telegram](TELEGRAM.md)
- [Голосовой интерфейс](VOICE.md)
- [STT](STT.md)
- [TTS](TTS.md)
- [Тестовая среда 1С](ONEC_TEST.md)

## 13. Критерии готовности к эксплуатации

Перед production необходимы отдельные подтверждённые проверки на целевой инфраструктуре: WinRM, SSH/known_hosts, SQL health и restore test, RouterOS REST, Mailcow, Telegram webhook, STT/TTS runtime, валидаторы 1С и доставка аудита во внешний append-only sink. Проверьте восстановление из backup на чистом окружении.

Пока эти проверки не завершены и не зафиксированы для конкретного commit, JARVIS остаётся **pre-production**.
