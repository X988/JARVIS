> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Пакетный режим конфигуратора 1С

## Общие сведения


**Два режима запуска:**

| Режим | Назначение |
|-------|-----------|
| `DESIGNER` | Конфигуратор — работа с конфигурацией, сборка EPF, обновление БД |
| `ENTERPRISE` | Предприятие — запуск обработок, навигация по ссылкам |
| `CREATEINFOBASE` | Создание новой информационной базы |


## Подключение к информационной базе

| Параметр | Описание |
|----------|----------|
| `/S <адрес>` | Серверная база — формат `server/ibname` |
| `/IBName <имя>` | По имени из списка баз (в кавычках если содержит пробелы) |
| `/IBConnectionString` | Полная строка соединения |

Примеры:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Аутентификация

| Параметр | Описание |
|----------|----------|
| `/N<имя>` | Имя пользователя (**без пробела** после `/N`) |
| `/P<пароль>` | Пароль (**без пробела** после `/P`). Можно опустить если пароля нет |
| `/WA-` | Запретить аутентификацию ОС |
| `/WA+` | Обязательная аутентификация ОС (по умолчанию) |

> **Важно**: между `/N` и именем, а также между `/P` и паролем пробела нет: `/NАдмин /PSecret123`.

## Общие параметры пакетного режима

| Параметр | Описание |
|----------|----------|
| `/DisableStartupDialogs` | Подавляет интерактивные диалоги. **Обязательно** для пакетного режима — без него конфигуратор может зависнуть в ожидании ввода |
| `/DisableStartupMessages` | Подавляет стартовые предупреждения (несоответствие конфигурации БД и т.п.) |
| `/Out <файл> [-NoTruncate]` | Файл для вывода служебных сообщений (UTF-8). `-NoTruncate` — не очищать файл перед записью |
| `/DumpResult <файл>` | Записать числовой код результата в файл (0 — успех, 1 — ошибка, 101 — ошибки проверки) |
| `/Visible` | Показать окно конфигуратора (по умолчанию скрыто в пакетном режиме) |

## Создание информационной базы

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Файловая база

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Серверная база

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

### Параметры

| Параметр | Описание |
|----------|----------|
| `File="<путь>"` | Строка соединения для файловой базы |
| `Srvr="<сервер>";Ref="<имя>"` | Строка соединения для серверной базы |
| `/AddToList [<имя>]` | Добавить в список баз. Имя — необязательно |
| `/UseTemplate <файл>` | Создать по шаблону (.cf или .dt) |
| `/DumpResult <файл>` | Записать результат (0 — успех) |

## Работа с конфигурацией — бинарные файлы (CF)

### Выгрузка конфигурации в CF-файл

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**`/DumpCfg <файл> [-Extension <имя>]`** — сохранить конфигурацию в .cf-файл.

### Загрузка конфигурации из CF-файла

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**`/LoadCfg <файл> [-Extension <имя>] [-AllExtensions]`** — загрузить конфигурацию из .cf-файла.

| Параметр | Описание |
|----------|----------|
| `-Extension <имя>` | Работа с расширением (указать имя) |
| `-AllExtensions` | Работа со всеми расширениями (файл — архив расширений) |

> После `/LoadCfg` конфигурация загружается в «основную» конфигурацию конфигуратора. Для применения к БД необходим `/UpdateDBCfg`.

## Работа с конфигурацией — XML-исходники

### Выгрузка `/DumpConfigToFiles`

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Полная сигнатура:
```
/DumpConfigToFiles <каталог> [-Extension <имя>] [-AllExtensions]
    [-update] [-force] [-getChanges <файл>]
    [-configDumpInfoForChanges <файл>] [-listFile <файл>]
    [-configDumpInfoOnly] [-Server] [-Format <формат>]
    [-Archive <файл>] [-ignoreUnresolvedReferences]
```

#### Режимы выгрузки

**Полная выгрузка** — все объекты конфигурации:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**Инкрементальная выгрузка** — только изменённые объекты:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Инкрементальная выгрузка с отслеживанием изменений:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**Частичная выгрузка** — выбранные объекты по списку:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**Обновление ConfigDumpInfo.xml** — без выгрузки файлов:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

#### Параметры выгрузки

| Параметр | Описание |
|----------|----------|
| `-update` | Обновляющая (инкрементальная) выгрузка — только изменённые объекты |
| `-force` | Принудительная полная выгрузка. Используется с `-update` при несовпадении версий |
| `-getChanges <файл>` | Записать список изменённых файлов |
| `-configDumpInfoForChanges <файл>` | Файл ConfigDumpInfo.xml для определения изменений |
| `-listFile <файл>` | Файл со списком выгружаемых объектов (по одному на строку) |
| `-configDumpInfoOnly` | Выгрузить только ConfigDumpInfo.xml |
| `-Extension <имя>` | Выгрузить расширение |
| `-AllExtensions` | Выгрузить все расширения |
| `-Server` | Выгрузка на стороне сервера |
| `-Format <формат>` | Формат файлов (Hierarchical / Plain) |
| `-Archive <файл>` | Выгрузка в архивный файл |
| `-ignoreUnresolvedReferences` | Игнорировать неразрешённые ссылки |

#### Формат listFile для выгрузки

Файл содержит **имена объектов метаданных** (одно на строку):
```
Справочник.Номенклатура
Справочник.Валюты
Документ.РеализацияТоваровУслуг
Отчет.АнализПродаж
```

Кодировка: UTF-8 с BOM.

### Загрузка `/LoadConfigFromFiles`

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Полная сигнатура:
```
/LoadConfigFromFiles <каталог> [-Extension <имя>] [-AllExtensions]
    [-updateConfigDumpInfo] [-listFile <файл>]
    [-Server] [-Archive <файл>] [-Format <формат>]
```

#### Режимы загрузки

**Полная загрузка** — замена всей конфигурации:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

**Частичная загрузка** — выбранные файлы по списку:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

#### Параметры загрузки

| Параметр | Описание |
|----------|----------|
| `-listFile <файл>` | Файл со списком загружаемых файлов (по одному на строку) |
| `-partial` | Частичная загрузка — **не заменять** всю конфигурацию, а внести точечные изменения. Недокументированный, но рабочий параметр |
| `-updateConfigDumpInfo` | Обновить ConfigDumpInfo.xml после загрузки |
| `-Extension <имя>` | Загрузить в расширение |
| `-AllExtensions` | Загрузить все расширения |
| `-Server` | Загрузка на стороне сервера |
| `-Archive <файл>` | Загрузка из архивного файла |
| `-Format <формат>` | Формат файлов (Hierarchical / Plain) |

#### Формат listFile для загрузки

Файл содержит **относительные пути к файлам** в каталоге выгрузки (один на строку):
```
Catalogs/Валюты.xml
Catalogs/Валюты/Ext/ObjectModule.bsl
Documents/РеализацияТоваровУслуг.xml
Documents/РеализацияТоваровУслуг/Forms/ФормаДокумента.xml
```

Кодировка: UTF-8 с BOM.

> **Важно: различие форматов listFile для dump и load:**
> - **Выгрузка** (`/DumpConfigToFiles -listFile`): имена объектов метаданных — `Справочник.Номенклатура`
> - **Загрузка** (`/LoadConfigFromFiles -listFile`): относительные пути файлов — `Catalogs/Валюты.xml`

## Обновление конфигурации БД

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Полная сигнатура:
```
/UpdateDBCfg [-Dynamic<режим>] [-Server]
    [-WarningsAsErrors]
    [-BackgroundStart] [-BackgroundFinish]
    [-BackgroundCancel] [-BackgroundSuspend] [-BackgroundResume]
    [-Extension <имя>] [-AllExtensions]
```

| Параметр | Описание |
|----------|----------|
| `-Dynamic+` | Использовать динамическое обновление |
| `-Dynamic-` | Не использовать динамическое обновление |
| `-Server` | Обновление на стороне сервера |
| `-WarningsAsErrors` | Предупреждения считать ошибками |
| `-Extension <имя>` | Обновить расширение |
| `-AllExtensions` | Обновить все расширения |

### Фоновое обновление

| Параметр | Описание |
|----------|----------|
| `-BackgroundStart` | Начать фоновое обновление |
| `-BackgroundFinish` | Дождаться окончания и завершить |
| `-BackgroundCancel` | Отменить фоновое обновление |
| `-BackgroundSuspend` | Приостановить |
| `-BackgroundResume` | Возобновить |

> После `/LoadCfg` или `/LoadConfigFromFiles` необходимо выполнить `/UpdateDBCfg` чтобы изменения применились к базе данных.

## Сборка и разборка внешних обработок (EPF/ERF)

### Сборка (XML → EPF)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `<корневой_xml>` | Путь к корневому XML-файлу обработки (например, `src\МояОбработка.xml`) |
| `<путь_к_epf>` | Путь к выходному файлу `.epf` или `.erf` |

> **Важно**: первый аргумент — путь к **корневому XML-файлу** (не к каталогу). Если указать каталог, конфигуратор вернёт ошибку.

### Разборка (EPF → XML)

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `<каталог_выгрузки>` | Каталог для XML-файлов |
| `<путь_к_epf>` | Исходный файл `.epf` или `.erf` |
| `-Format Hierarchical` | Иерархическая структура каталогов (по умолчанию) |
| `-Format Plain` | Плоская структура |

### Примечания по сборке

- Категории колонок регистров (Dimension/Resource/Attribute) угадываются по Form.xml — при round-trip через реальную базу привязки полей формы могут не сохраниться.

### Примечания по разборке

- Разборка **обязательно** требует базу с конфигурацией, содержащей используемые типы.
- Dump в пустой базе **безвозвратно** теряет ссылочные типы — `CatalogRef.XXX` превращается в `xs:string`.

## Запуск в режиме предприятия

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

| Параметр | Описание |
|----------|----------|
| `/Execute <файл.epf>` | Запуск внешней обработки сразу после старта. При указании `/Execute` параметр `/URL` игнорируется |
| `/URL <ссылка>` | Навигационная ссылка (формат `e1cib/...`) |
| `/C <строка>` | Передача параметра в прикладное решение |

Примеры:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Коды возврата

| Код | Значение |
|-----|----------|
| `0` | Успешно |
| `1` | Ошибка |
| `101` | Ошибки при проверке конфигурации |

Числовой код можно записать в файл через `/DumpResult <файл>`.

При работе с расширениями (`-Extension`, `-AllExtensions`): 0 — успех, 1 — ошибка.

## ConfigDumpInfo.xml

`ConfigDumpInfo.xml` — служебный файл, создаваемый при выгрузке конфигурации в файлы (`/DumpConfigToFiles`). Содержит информацию о составе и версиях объектов конфигурации на момент выгрузки.

**Назначение:**
- Определение изменений при инкрементальной выгрузке (`-update`, `-configDumpInfoForChanges`)
- Синхронизация состояния выгрузки с конфигурацией ИБ

**Использование:**
- `-configDumpInfoForChanges <файл>` — передать предыдущий ConfigDumpInfo.xml для определения изменений
- `-configDumpInfoOnly` — обновить только этот файл без выгрузки объектов
- `-updateConfigDumpInfo` — обновить файл после частичной загрузки (`/LoadConfigFromFiles`)

**Расположение:** корень каталога выгрузки (рядом с `Configuration.xml`).

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `V8_BASE` | Путь к пустой ИБ для EPF-сборки (создаётся автоматически при первом запуске) |
