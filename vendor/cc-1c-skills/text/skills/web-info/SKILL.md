> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `web-info`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Статус Apache и веб-публикаций 1С — запущен ли сервер, какие базы опубликованы, ошибки. Используй когда пользователь спрашивает про статус веб-сервера, опубликованные базы, работает ли Apache


# /web-info — Статус Apache и публикаций 1С

Показывает состояние Apache HTTP Server, список опубликованных баз и последние ошибки.

## Usage

```
/web-info
```

## Параметры подключения

Прочитай `.v8-project.json` из корня проекта. Если задан `webPath` — используй как `-ApachePath`.
По умолчанию `tools/apache24` от корня проекта.

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры скрипта

| Параметр | Обязательный | Описание |
|----------|:------------:|----------|
| `-ApachePath <путь>` | нет | Корень Apache (по умолчанию `tools/apache24`) |

## Как читать вывод

Три секции: состояние сервера, список публикаций (имя, URL, строка соединения, теги сервисов),
хвост журнала Apache.

| В выводе | Что значит |
|----------|------------|
| `Status: Остановлен` | Apache не запущен — публикации в `httpd.conf` есть, но URL-ы не отвечают. Поднимается повторным `/web-publish` |
| `Port: 9191 (не отвечает)` | Порт не слушается — URL-ы не откроются. Вместе с `Status: Запущен` значит, что сервер не поднялся (занятый порт, битый конфиг): смотри секцию ошибок |
| `[WARN] Обнаружен сторонний Apache` | На машине работает чужой экземпляр — может держать порт; наши команды им не управляют |
| `[WS HTTP OData]` | Что опубликовано для базы: SOAP-сервисы, HTTP-сервисы, стандартный OData |
| `+ext` (`WS+ext`) | Публикуются и сервисы, поставляемые расширениями конфигурации |
| `(нет публикаций)` | Apache установлен, но ни одна база не опубликована — нужен `/web-publish` |
| `(ошибок нет)` / `(нет файла)` | Норма, а не сбой: ошибок в журнале нет или он ещё не создан |

В ошибках — последние записи уровня `error` и выше, информационные строки отфильтрованы. Журнал не
ротируется, поэтому запись может быть полугодовой давности: смотри дату, прежде чем считать её
причиной текущей проблемы. Рядом печатается путь к журналу — нужен полный контекст, прочитай файл.

Строка публикации говорит «так настроено», а не «база отвечает»: проверяется доступность самого
Apache, но не публикаций. Убедиться в конкретной базе можно запросом к её URL — но учти, что такой
запрос поднимает сеанс 1С и занимает лицензию.

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
