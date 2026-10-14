# Release checklist JARVIS

Текущий статус проекта — **pre-production**. Версия `0.1.0` не означает production verification.

## 1. Source and CI gate

Перед выпуском конкретного commit должны быть зелёными:

- `npm ci`;
- `npm run typecheck`;
- `npm run lint`;
- `npm test`;
- `npm run coverage`;
- `npm run security:secrets`;
- `npm run security:audit` — блокирует critical vulnerabilities;
- CycloneDX SBOM generation/validation;
- `npm run build`;
- `npm run e2e`.

Actions в CI должны оставаться закреплёнными на проверенных immutable SHA. Любое обновление SHA выполняется отдельным reviewable изменением.

## 2. Release identity

- SemVer берётся из `package.json`.
- Тег создаётся только после зелёного CI и review.
- Release notes должны перечислять security boundaries, migrations, known risks и live-verification status.
- Build artifact должен иметь SHA-256 checksum и deployment manifest, привязанный к commit SHA.
- Нельзя называть релиз production-ready, если live infrastructure checks не выполнены.

## 3. Secrets and state

- Production secrets не хранятся в Git, audit, worker logs, metrics или artifacts.
- Runtime secret source сейчас — environment / mounted secret files.
- Перед production нужно выбрать и проверить внешний secret manager (Vault/cloud secret manager) либо эквивалентный контролируемый механизм.
- Filesystem state retention настраивается через `JARVIS_*_RETENTION_*` / `*_MAX_*`.
- Corrupted security state должен приводить к отказу, а не к автоматическому reset.

## 4. Staging lifecycle

```text
feature branch
→ PR
→ CI
→ staging deploy
→ migrations
→ integration smoke
→ /health
→ /ready
→ read-only functional smoke
→ audit delivery check
→ human approval
```

Staging должен использовать отдельные credentials и отдельные targets. Production credentials не выдаются coding worker.

## 5. Production deployment

Production deployment **не автоматизируется LLM-ом**. Перед запуском требуется human gate.

После deploy:

1. `/health` подтверждает только живой процесс.
2. `/ready` в `production-infra` должен быть 200 только при свежих обязательных live probes.
3. Выполняется read-only smoke через обычный authenticated pipeline.
4. Проверяется внешний audit sink и backlog.
5. Проверяются метрики ошибок/adapter health.

Если post-deploy health не проходит, дальнейшие mutating actions блокируются и выполняется документированный rollback версии.

## 6. Infrastructure verification

До production verification отдельно подтвердить на реальных целях:

- WinRM;
- SSH + strict known_hosts;
- SQL health, backup CHECKSUM, HEADERONLY, VERIFYONLY и изолированный restore test;
- RouterOS REST fixed endpoints;
- Mailcow;
- GitHub CI read-only token;
- Telegram webhook;
- STT/TTS runtime;
- 1С BSL/Designer/EDT/test DB validators;
- HTTP/Loki external audit delivery.

Статусы `CONFIGURED_UNPROBED`, `UNPROBED`, `NOT_CONFIGURED` и mock/dry-run не являются production success.

## 7. Rollback

- Код: deploy предыдущего проверенного artifact/commit; не force-push в `main`.
- Database/schema: использовать только заранее проверенную migration/rollback procedure; если rollback невозможен, это должно быть явно отмечено до approval.
- 1С development/test patch: использовать сохранённый before-state / Git diff; production 1С upload остаётся DENY_ALWAYS.
- Dirty coding worktree retention-cleanup не удаляет.
- Audit history не удаляется как способ rollback.

## 8. Disaster recovery

Следовать `docs/BACKUP.md`. Backup считается operationally verified только после restore-test на clean machine/clean directory и функционального smoke.

## 9. Human approval

Worker/LLM не может:

- merge PR;
- push напрямую в `main/master`;
- deploy production;
- перезапускать production services;
- получать production credentials;
- отключать audit/policy;
- считать rollback успешным без verification.

Финальный production gate остаётся человеческим.
