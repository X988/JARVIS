# Выпуск JARVIS

Пока на экране написано DEMO, это не выпуск в контур компании.

- CI: `npm run typecheck`, `npm test`, `npm run build` зелёные.
- Миграции: `npm run db:migrate` на копии базы, не на боевой.
- Окружение: секреты только в переменных. Файлы `.env` не в git.
- База консоли: каталог `data/` локальный, в репозиторий не входит.
- Backup консоли: скопировать `data/audit.jsonl` и файл базы. Проверить `verifyAudit`.
- Восстановление: пустой каталог, `npm ci`, вернуть `data/`, `npm run db:migrate`, открыть `/ready`.
- RBAC: allowlist операторов на сервере в `OPERATORS`. Имя с клиента не даёт права.
- Исполнители: 1С только `FileOnecExecutor` по выгрузке development/test. Windows, Linux, SQL, MikroTik, Mailcow не вызываются, пока нет своей переменной и живого адаптера.
- Слежение: без переменных провайдер один, `demo`. С алерта ремонт не стартует.
- Health: `GET /health` и `GET /ready`.
- Smoke: чужой id получает deny, «удали базу» получает deny, правка production 1С получает deny.
- Откат: расширение 1С снимается человеком в тестовой базе. Код откатывается revert коммита, не force-push в main.
- Audit: `data/audit.jsonl`, у строки previousHash и hash. Правка старой строки ломает проверку.
- Версия: тег только после зелёного CI. Автовыкладки в production нет.
