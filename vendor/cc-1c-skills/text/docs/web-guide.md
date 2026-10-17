> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Веб-публикация 1С

Навыки группы `/web-*` позволяют публиковать информационные базы 1С через Apache HTTP Server для доступа из браузера (веб-клиент). Это замыкает цикл разработки: правка исходников → загрузка → обновление БД → **открытие в браузере**.

## Навыки

| Навык | Скрипт | Описание |
|-------|:------:|----------|

## Рабочий цикл

```
правки в исходниках → /db-load-xml → /db-update → /web-publish → браузер
                                                        ↑
                                   /web-info ← статус   |
                                   /web-stop ← остановка|
                                   /web-unpublish ← удаление
```

### Типичный цикл разработки

1. **Настройка** — `/db-list add` зарегистрировать базу в `.v8-project.json`
2. **Загрузка** — `/db-load-xml` загрузить конфигурацию
3. **Обновление** — `/db-update` применить к БД
4. **Публикация** — `/web-publish` опубликовать базу (при первом запуске скачает Apache)
5. **Проверка** — открыть `http://localhost:8081/{appname}` в браузере
6. **Правка** — изменить исходники
7. **Синхронизация** — `/db-load-git` + `/db-update`
8. **Проверка** — обновить страницу в браузере
9. **Завершение** — `/web-stop` остановить Apache

## Конфигурация в `.v8-project.json`

Поле `webPath` указывает путь к каталогу Apache. Если не задано, используется `tools/apache24` от корня проекта.

Полное описание формата — в [справочнике .v8-project.json](v8-project-guide.md).

## Сценарии использования

### Опубликовать базу

```
> Опубликуй базу bp-demo
```

Claude вызовет `/web-publish bp-demo` → скачает Apache (если нет) → сгенерирует VRD → настроит httpd.conf → запустит Apache → выдаст URL.

### Проверить статус

```
> Что с веб-сервером?
```

Claude вызовет `/web-info` → покажет состояние Apache, порт, список публикаций, последние ошибки.

### Опубликовать на другом порту

```
> Опубликуй ERP на порту 9090
```

Claude вызовет `/web-publish erp --port 9090`.

### Сменить пользователя публикации

```
> Переключи публикацию bp-demo на пользователя Иванов
```

Claude вызовет `/web-publish bp-demo` с `-UserName "Иванов"` — перезапишет VRD с новым пользователем.

### Параллельные публикации под разными пользователями

```
> Добавь ещё одну публикацию bp-demo под Ивановым, Admin оставь
```

Claude вызовет `/web-publish bp-demo --appname bpdemo-ivanov --user Иванов` — создаст вторую публикацию. Обе будут доступны одновременно по разным URL.

### Остановить сервер

```
> Останови Apache
```

Claude вызовет `/web-stop`.

### Удалить публикацию

```
> Убери публикацию bpdemo
```

Claude вызовет `/web-unpublish bpdemo` → удалит блок из httpd.conf → удалит каталог → перезапустит Apache (если есть другие публикации).

### Удалить все публикации

```
> Удали все веб-публикации
```

Claude вызовет `/web-unpublish --all` → удалит все блоки из httpd.conf → удалит все каталоги → остановит Apache.

## Работа с сервисами

### Протестировать HTTP-сервис
```
> Вызови HTTP-сервис ОбменДанными метод ПолучитьСтатус
```

Claude составит curl/Invoke-WebRequest к `http://localhost:8081/appname/hs/exchange/status`

### Проверить OData
```
> Покажи список справочников через OData
```

Claude вызовет `http://localhost:8081/appname/odata/standard.odata/$metadata`

### Получить WSDL web-сервиса
```
> Покажи WSDL сервиса ОбменСВнешнимиСистемами
```

Claude откроет `http://localhost:8081/appname/ws/ExchangeWithExternalSystems?wsdl`

## Ручная установка Apache

Если автоматическая загрузка невозможна (прокси, firewall), используйте флаг `--manual`:

```
> Опубликуй базу --manual
```

Скрипт выдаст инструкцию:
1. Скачайте Apache Lounge (x64 VS17) с https://www.apachelounge.com/download/
2. Распакуйте содержимое `Apache24/` в `tools/apache24` (или путь из `webPath`)
3. Запустите команду повторно

## Спецификации

- [web-spec.md](web-spec.md) — техническая спецификация (VRD, httpd.conf, wsap24.dll, portable Apache)
- [build-spec.md](build-spec.md) — пакетный режим конфигуратора 1С
