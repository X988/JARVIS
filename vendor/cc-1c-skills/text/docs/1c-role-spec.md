> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Спецификация формата ролей 1С:Предприятия 8.3

Полное описание XML-формата ролей в выгрузке конфигурации. Проверенный диапазон версий формата: 2.17 (платформа 8.3.24) … 2.21 (8.5); полная лестница — [1c-configuration-spec.md §7.1](1c-configuration-spec.md#71-лестница-версий). Структура идентична; отличается атрибут `version`, а с 2.19 — ещё и набор выгружаемых прав (см. «Версии формата»).

## Файловая структура

Каждая роль состоит из двух файлов:

```
Roles/
  ИмяРоли.xml                    ← метаданные (uuid, имя, синоним)
  ИмяРоли/
    Ext/
      Rights.xml                  ← определение прав
```

## Регистрация роли в конфигурации

При создании роли необходимо прописать ссылки в следующих местах:

### Configuration.xml — ChildObjects

Регистрация объекта в составе конфигурации:

```xml
<ChildObjects>
    ...
    <Role>ИмяРоли</Role>
    ...
</ChildObjects>
```

Элементы `<Role>` располагаются среди других объектов конфигурации в секции `<ChildObjects>`.

### Configuration.xml — DefaultRoles (опционально)

Если роль должна назначаться новым пользователям по умолчанию:

```xml
<DefaultRoles>
    <xr:Item xsi:type="xr:MDObjectRef">Role.ИмяРоли</xr:Item>
</DefaultRoles>
```

### Form.xml — права редактирования реквизитов (опционально)

В формах роль может упоминаться для ограничения редактирования реквизитов:

```xml
<Attribute>
    <Edit>
        <xr:Common>false</xr:Common>
        <xr:Value name="Role.ИмяРоли">true</xr:Value>
    </Edit>
</Attribute>
```

---

## Файл метаданных: Roles/ИмяРоли.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MetaDataObject xmlns="http://v8.1c.ru/8.3/MDClasses"
        xmlns:app="http://v8.1c.ru/8.2/managed-application/core"
        xmlns:cfg="http://v8.1c.ru/8.1/data/enterprise/current-config"
        xmlns:cmi="http://v8.1c.ru/8.2/managed-application/cmi"
        xmlns:ent="http://v8.1c.ru/8.1/data/enterprise"
        xmlns:lf="http://v8.1c.ru/8.2/managed-application/logform"
        xmlns:style="http://v8.1c.ru/8.1/data/ui/style"
        xmlns:sys="http://v8.1c.ru/8.1/data/ui/fonts/system"
        xmlns:v8="http://v8.1c.ru/8.1/data/core"
        xmlns:v8ui="http://v8.1c.ru/8.1/data/ui"
        xmlns:web="http://v8.1c.ru/8.1/data/ui/colors/web"
        xmlns:win="http://v8.1c.ru/8.1/data/ui/colors/windows"
        xmlns:xen="http://v8.1c.ru/8.3/xcf/enums"
        xmlns:xpr="http://v8.1c.ru/8.3/xcf/predef"
        xmlns:xr="http://v8.1c.ru/8.3/xcf/readable"
        xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        version="2.17">
    <Role uuid="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX">
        <Properties>
            <Name>ИмяРоли</Name>
            <Synonym>
                <v8:item>
                    <v8:lang>ru</v8:lang>
                    <v8:content>Отображаемое имя роли</v8:content>
                </v8:item>
            </Synonym>
            <Comment/>
        </Properties>
    </Role>
</MetaDataObject>
```

### Элементы

| Элемент | Обязательный | Описание |
|---------|:------------:|----------|
| `Role/@uuid` | да | UUID роли (формат `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `Name` | да | Программное имя роли (идентификатор, латиница/кириллица) |
| `Synonym` | да | Мультиязычное отображаемое имя (один или несколько `v8:item`) |
| `Comment` | да | Комментарий (может быть пустым `<Comment/>`) |

### Namespace

Основной: `http://v8.1c.ru/8.3/MDClasses`
Мультиязычные строки: `v8` = `http://v8.1c.ru/8.1/data/core`

---

## Файл прав: Roles/ИмяРоли/Ext/Rights.xml

### Корневой элемент

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Rights xmlns="http://v8.1c.ru/8.2/roles"
        xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:type="Rights"
        version="2.17">
    <setForNewObjects>false</setForNewObjects>
    <setForAttributesByDefault>true</setForAttributesByDefault>
    <independentRightsOfChildObjects>false</independentRightsOfChildObjects>

    <object>...</object>
    ...

    <restrictionTemplate>...</restrictionTemplate>
    ...
</Rights>
```

### Namespace

`http://v8.1c.ru/8.2/roles` (NB: 8.2, а не 8.3 — исторически)

### Глобальные флаги

| Флаг | Тип | По умолчанию | Описание |
|------|-----|:------------:|----------|
| `setForNewObjects` | boolean | false | Устанавливать права для новых объектов конфигурации |
| `setForAttributesByDefault` | boolean | true | Устанавливать права для реквизитов по умолчанию |
| `independentRightsOfChildObjects` | boolean | false | Независимые права подчинённых объектов |

### Структура блока `<object>`

```xml
<object>
    <name>ТипОбъекта.ИмяОбъекта</name>
    <right>
        <name>ИмяПрава</name>
        <value>true</value>
    </right>
    <right>
        <name>ИмяПрава</name>
        <value>true</value>
        <restrictionByCondition>
            <condition>Текст условия RLS</condition>
        </restrictionByCondition>
    </right>
</object>
```

| Элемент | Обязательный | Описание |
|---------|:------------:|----------|
| `object/name` | да | Полное имя объекта метаданных (dot-нотация) |
| `right/name` | да | Имя права (см. таблицы ниже) |
| `right/value` | да | `true` или `false` |
| `right/restrictionByCondition` | нет | Ограничение на уровне записей (RLS). Их может быть несколько на одно право |
| `restrictionByCondition/field` | нет | Поле, на которое действует ограничение. Может повторяться; порядок — ordinal |
| `restrictionByCondition/condition` | да | Текст условия на языке шаблонов ограничений. Пустой (`<condition/>`) = доступ без ограничения |

Ограничения права — это список строк, как таблица «Ограничения доступа к данным» в редакторе
ролей. Строка **без** `<field>` действует на все прочие поля, строка с `<field>` — только на
перечисленные. Строка без полей идёт первой. Типовой приём — закрыть таблицу целиком, оставив
ссылочные поля доступными, чтобы ссылки на объект не рвались:

```xml
<right>
    <name>Read</name>
    <value>true</value>
    <restrictionByCondition>
        <condition>ГДЕ ЛОЖЬ</condition>
    </restrictionByCondition>
    <restrictionByCondition>
        <field>Ref</field>
        <field>Date</field>
        <field>Number</field>
        <condition/>
    </restrictionByCondition>
</right>
```

Стандартные реквизиты в `<field>` платформа пишет по-английски: `Ref`, `Code`, `Description`,
`Parent`, `Owner`, `Date`, `Number`, `DeletionMark`, `IsFolder`, `DataVersion`, `Posted`,
`Predefined`. Прикладные реквизиты — своими именами.

### Зависимые права

Платформа при загрузке доводит набор прав до замыкания: `Edit` тянет `Read`, `Update`, `View`;
интерактивные права — свой базовый набор; `View` у обработки и отчёта — `Use`. Запрет работает в
обратную сторону: `View=false` у реквизита тянет `Edit=false`. Файл, записанный без замыкания,
после первой же загрузки разойдётся с базой.

Права `Configuration` версионные: до формата 2.19 (платформа 8.3.26) любое из них взводило весь
блок `MainWindowMode*` и `AnalyticsSystemClient`, начиная с 2.19 — нет.

### Порядок узлов

Порядок `<right>` внутри `<object>` фиксирован для типа объекта, порядок самих `<object>` —
по uuid объекта метаданных (у вложенного — по uuid самого реквизита или команды). Платформа
нормализует и то, и другое при выгрузке; порядок дерева конфигурации тут ни при чём.

### Именование объектов (dot-нотация)

Объекты адресуются иерархически через точку:

```
ТипОбъекта.ИмяОбъекта[.ТипВложенного[.ИмяВложенного[...]]]
```

#### Верхний уровень — объекты метаданных

```
Catalog.Контрагенты
Document.РеализацияТоваровУслуг
InformationRegister.ЦеныНоменклатуры
DataProcessor.ЗагрузкаДанных
Report.АнализПродаж
Configuration.ИмяКонфигурации
```

#### Стандартные реквизиты

```
Catalog.Контрагенты.StandardAttribute.Code
Catalog.Контрагенты.StandardAttribute.Description
Catalog.Контрагенты.StandardAttribute.DeletionMark
Catalog.Контрагенты.StandardAttribute.Predefined
Catalog.Контрагенты.StandardAttribute.PredefinedDataName
Catalog.Контрагенты.StandardAttribute.Ref
Catalog.Контрагенты.StandardAttribute.IsFolder
Catalog.Контрагенты.StandardAttribute.Parent
Catalog.Контрагенты.StandardAttribute.Owner
Document.Реализация.StandardAttribute.Posted
Document.Реализация.StandardAttribute.Date
Document.Реализация.StandardAttribute.Number
```

#### Реквизиты

```
Catalog.Контрагенты.Attribute.ИНН
Document.Реализация.Attribute.Организация
```

#### Табличные части и их реквизиты

```
Document.Реализация.TabularSection.Товары
Document.Реализация.TabularSection.Товары.Attribute.Номенклатура
Document.Реализация.TabularSection.Товары.StandardAttribute.LineNumber
```

#### Измерения, ресурсы, реквизиты регистров

```
InformationRegister.Цены.Dimension.Номенклатура
InformationRegister.Цены.Resource.Цена
AccumulationRegister.Остатки.Attribute.ДатаОперации
AccountingRegister.Хозрасчетный.Dimension.Организация
```

#### Команды

```
Catalog.Контрагенты.Command.ОткрытьКарточку
DataProcessor.Обработка.Command.Выполнить
CommonCommand.УправлениеОборудованием
```

#### Реквизиты адресации (бизнес-процессы/задачи)

```
Task.ЗадачаИсполнителя.AddressingAttribute.Исполнитель
Task.ЗадачаИсполнителя.AddressingAttribute.ОсновнойОбъектАдресации
```

#### Операции веб-сервисов

```
WebService.Exchange.Operation.GetIBParameters
HTTPService.ЭДО.URLTemplate.Документы.Method.POST
```

#### Вложенные подсистемы

```
Subsystem.Администрирование.Subsystem.Пользователи
```

---

## Полный каталог прав по типам объектов

### Права объектов верхнего уровня

#### Configuration

Права конфигурации в целом. Объект: `Configuration.ИмяКонфигурации`.

| Право | Описание |
|-------|----------|
| `Administration` | Администрирование |
| `DataAdministration` | Администрирование данных |
| `UpdateDataBaseConfiguration` | Обновление конфигурации БД |
| `ConfigurationExtensionsAdministration` | Администрирование расширений |
| `ActiveUsers` | Активные пользователи |
| `EventLog` | Журнал регистрации |
| `ExclusiveMode` | Монопольный режим |
| `ThinClient` | Тонкий клиент |
| `ThickClient` | Толстый клиент |
| `WebClient` | Веб-клиент |
| `MobileClient` | Мобильный клиент |
| `ExternalConnection` | Внешнее соединение |
| `Automation` | Automation (COM) |
| `Output` | Вывод (печать, сохранение, копирование) |
| `SaveUserData` | Сохранение данных пользователя |
| `TechnicalSpecialistMode` | Режим технического специалиста |
| `InteractiveOpenExtDataProcessors` | Интерактивное открытие внешних обработок |
| `InteractiveOpenExtReports` | Интерактивное открытие внешних отчётов |
| `AnalyticsSystemClient` | Клиент системы аналитики |
| `CollaborationSystemInfoBaseRegistration` | Регистрация ИБ в системе взаимодействия |
| `MainWindowModeNormal` | Режим обычного окна |
| `MainWindowModeWorkplace` | Режим рабочего места |
| `MainWindowModeEmbeddedWorkplace` | Режим встроенного рабочего места |
| `MainWindowModeFullscreenWorkplace` | Режим полноэкранного рабочего места |
| `MainWindowModeKiosk` | Режим киоска |

#### Catalog

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Интерактивная пометка удаления |
| `InteractiveClearDeletionMark` | Интерактивное снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveDeleteMarked` | Интерактивное удаление помеченных |
| `InteractiveDeletePredefinedData` | Интерактивное удаление предопределённых |
| `InteractiveSetDeletionMarkPredefinedData` | Пометка удаления предопределённых |
| `InteractiveClearDeletionMarkPredefinedData` | Снятие пометки удаления предопределённых |
| `InteractiveDeleteMarkedPredefinedData` | Удаление помеченных предопределённых |
| `ReadDataHistory` | Чтение истории данных |
| `ViewDataHistory` | Просмотр истории данных |
| `UpdateDataHistory` | Обновление истории данных |
| `UpdateDataHistoryOfMissingData` | Обновление истории отсутствующих данных |
| `ReadDataHistoryOfMissingData` | Чтение истории отсутствующих данных |
| `UpdateDataHistorySettings` | Обновление настроек истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии истории данных |

#### Document

Все права Catalog (кроме предопределённых) плюс:

| Право | Описание |
|-------|----------|
| `Posting` | Проведение |
| `UndoPosting` | Отмена проведения |
| `InteractivePosting` | Интерактивное проведение |
| `InteractivePostingRegular` | Интерактивное проведение (неоперативное) |
| `InteractiveUndoPosting` | Интерактивная отмена проведения |
| `InteractiveChangeOfPosted` | Интерактивное изменение проведённых |

#### InformationRegister

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Update` | Изменение |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `TotalsControl` | Управление итогами (для периодических) |
| `ReadDataHistory` | Чтение истории данных |
| `ViewDataHistory` | Просмотр истории данных |
| `UpdateDataHistory` | Обновление истории данных |
| `UpdateDataHistoryOfMissingData` | Обновление истории отсутствующих данных |
| `ReadDataHistoryOfMissingData` | Чтение истории отсутствующих данных |
| `UpdateDataHistorySettings` | Настройки истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |

#### AccumulationRegister

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Update` | Изменение |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `TotalsControl` | Управление итогами |

#### AccountingRegister

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Update` | Изменение |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `TotalsControl` | Управление итогами |

#### CalculationRegister

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Update` | Изменение |
| `View` | Просмотр |
| `Edit` | Редактирование |

#### Constant

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Update` | Изменение |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `ReadDataHistory` | Чтение истории данных |
| `ViewDataHistory` | Просмотр истории данных |
| `UpdateDataHistory` | Обновление истории данных |
| `UpdateDataHistorySettings` | Настройки истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |

#### ChartOfAccounts

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Пометка удаления |
| `InteractiveClearDeletionMark` | Снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveDeletePredefinedData` | Удаление предопределённых |
| `InteractiveSetDeletionMarkPredefinedData` | Пометка удаления предопределённых |
| `InteractiveClearDeletionMarkPredefinedData` | Снятие пометки удаления предопределённых |
| `InteractiveDeleteMarkedPredefinedData` | Удаление помеченных предопределённых |
| `ReadDataHistory` | Чтение истории данных |
| `ReadDataHistoryOfMissingData` | Чтение истории отсутствующих данных |
| `UpdateDataHistory` | Обновление истории данных |
| `UpdateDataHistoryOfMissingData` | Обновление истории отсутствующих данных |
| `UpdateDataHistorySettings` | Настройки истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `InteractiveDeleteMarked` | Интерактивное удаление помеченных |
| `ViewDataHistory` | Просмотр истории данных |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |

#### ChartOfCharacteristicTypes

Аналогично ChartOfAccounts, плюс:

| Право | Описание |
|-------|----------|
| `InteractiveDeleteMarked` | Интерактивное удаление помеченных |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |
| `ViewDataHistory` | Просмотр истории данных |

#### ChartOfCalculationTypes

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Пометка удаления |
| `InteractiveClearDeletionMark` | Снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveDeletePredefinedData` | Удаление предопределённых |
| `InteractiveSetDeletionMarkPredefinedData` | Пометка удаления предопределённых |
| `InteractiveClearDeletionMarkPredefinedData` | Снятие пометки предопределённых |
| `InteractiveDeleteMarkedPredefinedData` | Удаление помеченных предопределённых |
| `InteractiveDeleteMarked` | Интерактивное удаление помеченных |
| `ReadDataHistory` | Чтение истории данных |
| `ReadDataHistoryOfMissingData` | Чтение истории отсутствующих данных |
| `UpdateDataHistory` | Обновление истории данных |
| `UpdateDataHistoryOfMissingData` | Обновление истории отсутствующих данных |
| `UpdateDataHistorySettings` | Настройки истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `ViewDataHistory` | Просмотр истории данных |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |

#### ExchangePlan

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Пометка удаления |
| `InteractiveClearDeletionMark` | Снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveDeleteMarked` | Удаление помеченных |
| `ReadDataHistory` | Чтение истории данных |
| `ViewDataHistory` | Просмотр истории данных |
| `UpdateDataHistory` | Обновление истории данных |
| `ReadDataHistoryOfMissingData` | Чтение истории отсутствующих |
| `UpdateDataHistoryOfMissingData` | Обновление истории отсутствующих |
| `UpdateDataHistorySettings` | Настройки истории данных |
| `UpdateDataHistoryVersionComment` | Обновление комментария версии |
| `EditDataHistoryVersionComment` | Редактирование комментария версии |
| `SwitchToDataHistoryVersion` | Переход к версии |

#### BusinessProcess

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `Start` | Старт |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Пометка удаления |
| `InteractiveClearDeletionMark` | Снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveActivate` | Интерактивная активация |
| `InteractiveStart` | Интерактивный старт |

#### Task

| Право | Описание |
|-------|----------|
| `Read` | Чтение |
| `Insert` | Добавление |
| `Update` | Изменение |
| `Delete` | Удаление |
| `View` | Просмотр |
| `Edit` | Редактирование |
| `InputByString` | Ввод по строке |
| `Execute` | Выполнение |
| `InteractiveInsert` | Интерактивное добавление |
| `InteractiveSetDeletionMark` | Пометка удаления |
| `InteractiveClearDeletionMark` | Снятие пометки удаления |
| `InteractiveDelete` | Интерактивное удаление |
| `InteractiveActivate` | Интерактивная активация |
| `InteractiveExecute` | Интерактивное выполнение |

#### Простые типы (одно-два права)

| Тип объекта | Права |
|-------------|-------|
| `DataProcessor` | Use, View |
| `Report` | Use, View |
| `CommonForm` | View |
| `CommonCommand` | View |
| `Subsystem` | View |
| `FilterCriterion` | View |
| `DocumentJournal` | Read, View |
| `Sequence` | Read, Update |
| `WebService` | Use |
| `HTTPService` | Use |
| `IntegrationService` | Use |
| `SessionParameter` | Get, Set |
| `CommonAttribute` | View, Edit |

#### ExternalDataSource

Источник ошибки в прежних редакциях спецификации: внешние источники данных права **имеют** —
узел «Внешние источники данных» есть в дереве редактора ролей. Значения ниже сняты с выгрузки
роли со всеми проставленными правами (8.3.25).

| Объект | Права |
|--------|-------|
| `ExternalDataSource.И` | Use, Administration, StandardAuthenticationChange, SessionStandardAuthenticationChange, SessionOSAuthenticationChange |
| `ExternalDataSource.И.Table.Т` | Read, Insert, Update, Delete, View, Edit, InputByString, InteractiveInsert, InteractiveDelete |
| `ExternalDataSource.И.Table.Т.Field.П` | View, Edit |
| `ExternalDataSource.И.Cube.К` | Read, View |
| `ExternalDataSource.И.Cube.К.Dimension.И` | View |
| `ExternalDataSource.И.Cube.К.Resource.Р` | View |
| `ExternalDataSource.И.Cube.К.DimensionTable.Т` | Read, View |
| `ExternalDataSource.И.Cube.К.DimensionTable.Т.Field.П` | View, Edit |
| `ExternalDataSource.И.Function.Ф` | Use, View |
| `…Table.Т.Command.К`, `…Cube.К.Command.К`, `…DimensionTable.Т.Command.К` | View |

#### Типы объектов БЕЗ прав в ролях

Следующие типы не фигурируют в Rights.xml — в дереве редактора ролей их нет:

- `Enum` (перечисления) — блок прав на перечисление приводит к зависанию загрузки
  конфигурации в информационную базу: конфигуратор не завершается и не выдаёт сообщений
- `CommonModule`
- `DefinedType`
- `CommonPicture`
- `CommonTemplate`
- `Language`
- `FunctionalOption`, `FunctionalOptionsParameter`
- `EventSubscription`
- `ScheduledJob`
- `StyleItem`, `Style`
- `SettingsStorage`
- `XDTOPackage`
- `WSReference`
- `DocumentNumerator`

---

### Права вложенных объектов

Права можно задавать не только на уровне объекта, но и на уровне его составных частей.

#### Реквизиты и стандартные реквизиты

Доступные права: `View`, `Edit`

```xml
<object>
    <name>Catalog.Контрагенты.StandardAttribute.PredefinedDataName</name>
    <right>
        <name>View</name>
        <value>false</value>
    </right>
    <right>
        <name>Edit</name>
        <value>false</value>
    </right>
</object>
```

Применимо к:
- `*.StandardAttribute.*` — стандартные реквизиты
- `*.Attribute.*` — реквизиты
- `*.TabularSection.*` — табличные части (целиком)
- `*.TabularSection.*.Attribute.*` — реквизиты табличных частей
- `*.TabularSection.*.StandardAttribute.*` — стандартные реквизиты табличных частей

#### Измерения, ресурсы регистров

Доступные права: `View`, `Edit`

```xml
<object>
    <name>InformationRegister.Цены.Dimension.Номенклатура</name>
    <right>
        <name>Edit</name>
        <value>false</value>
    </right>
</object>
```

Применимо к:
- `*Register.*.Dimension.*`
- `*Register.*.Resource.*`
- `*Register.*.Attribute.*`

#### Команды

Доступные права: `View`

```xml
<object>
    <name>Catalog.Контрагенты.Command.ОткрытьКарточку</name>
    <right>
        <name>View</name>
        <value>false</value>
    </right>
</object>
```

Применимо к:
- `*.Command.*` — команды любого объекта

#### Реквизиты адресации (Task)

Доступные права: `View`, `Edit`

```xml
<object>
    <name>Task.ЗадачаИсполнителя.AddressingAttribute.Исполнитель</name>
    <right>
        <name>View</name>
        <value>true</value>
    </right>
</object>
```

#### Полная таблица: вложенные объекты и их права

| Тип вложенного | Родители | Права |
|----------------|----------|-------|
| `StandardAttribute` | Catalog, Document, ExchangePlan, ChartOf*, Task, BusinessProcess, *Register, DocumentJournal | View, Edit |
| `Attribute` | Catalog, Document, ExchangePlan, ChartOf*, Task, BusinessProcess, *Register, DataProcessor, Report | View, Edit |
| `TabularSection` | Catalog, Document, ExchangePlan, ChartOf*, Task, BusinessProcess, DataProcessor, Report | View, Edit |
| `TabularSection.*.Attribute` | (все с TabularSection) | View, Edit |
| `Dimension` | InformationRegister, AccumulationRegister, AccountingRegister | View, Edit |
| `Resource` | InformationRegister, AccumulationRegister, AccountingRegister | View, Edit |
| `Command` | Catalog, Document, DataProcessor, Report, *Register, DocumentJournal, ExchangePlan, BusinessProcess, Task, ExternalDataSource (Table/Cube/DimensionTable) | View |
| `AddressingAttribute` | Task, BusinessProcess | View, Edit |
| `StandardTabularSection` | Catalog, Document, ChartOf* | View, Edit |
| `AccountingFlag`, `ExtDimensionAccountingFlag` | ChartOfAccounts | View, Edit |
| `Subsystem` | Subsystem (вложенная) | View |
| `Operation` | WebService | Use |
| `URLTemplate.*.Method` | HTTPService | Use |
| `IntegrationServiceChannel` | IntegrationService | Use |
| `Recalculation` | CalculationRegister | Read, Update |
| `Column` (графа журнала) | — | прав не имеет |
| `Table`, `Cube`, `Function`, `Field`, `DimensionTable` | только ExternalDataSource | см. раздел ExternalDataSource |

Виды, встречающиеся в выгрузках типовых конфигураций, сверены с корпусом
(`acc`, `erp`, `ut`, `unf` — ~2750 ролей); внешние источники данных — с выгрузкой роли,
где права проставлены по всему дереву.

---

## Ограничения на уровне записей (RLS)

### Структура

```xml
<right>
    <name>Read</name>
    <value>true</value>
    <restrictionByCondition>
        <condition>Текст условия</condition>
    </restrictionByCondition>
</right>
```

RLS добавляется внутрь `<right>` как дочерний элемент `<restrictionByCondition>`. Условие содержит текст на языке шаблонов ограничений 1С.

### Типичная структура условия

```
#Если &ОграничениеДоступаНаУровнеЗаписейУниверсально #Тогда
#ДляОбъекта("")
#Иначе
#ПоЗначениям("Документ.Реализация", "", "",
"Организации", "Организация",
"","",
...)
#КонецЕсли
```

Используются препроцессорные директивы (`#Если`, `#Тогда`, `#Иначе`, `#КонецЕсли`) и макросы шаблонов (`#ДляОбъекта`, `#ПоЗначениям`, `#ДляРегистра`, `#ПоЗначениямИНаборамРасширенный`).

XML-кодирование: `&` → `&amp;` в тексте условия.

### Применимость

RLS применяется к правам `Read`, `Update`, `Insert`, `Delete` объектов данных (Catalog, Document, Register и др.). Не применяется к интерактивным правам и правам конфигурации.

---

## Шаблоны ограничений (restrictionTemplate)

Располагаются в конце файла Rights.xml, после всех блоков `<object>`.

```xml
<restrictionTemplate>
    <name>ИмяШаблона(Параметр1, Параметр2, ...)</name>
    <condition>
// Комментарий с описанием параметров
// ...
Текст шаблона на языке запросов 1С
    </condition>
</restrictionTemplate>
```

### Типичные шаблоны

| Шаблон | Описание |
|--------|----------|
| `ДляОбъекта(Модификатор)` | Ограничение для ссылочных объектов (документы, справочники) |
| `ПоЗначениям(Таблица, -, Модификатор, В1,П1, ...)` | Ограничение по значениям видов доступа |
| `ДляРегистра(Регистр, Поле1, ..., Поле5)` | Ограничение для регистров |
| `ПоЗначениямИНаборамРасширенный(...)` | Расширенное ограничение по наборам и значениям |

Шаблоны определяются в роли и вызываются из `<condition>` блоков RLS через макросы `#ИмяШаблона(...)`.

---

## Примеры

### Минимальная роль (без прав)

**Roles/МояРоль.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<MetaDataObject xmlns="http://v8.1c.ru/8.3/MDClasses" xmlns:v8="http://v8.1c.ru/8.1/data/core"
        xmlns:xr="http://v8.1c.ru/8.3/xcf/readable" xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.17">
    <Role uuid="00000000-0000-0000-0000-000000000001">
        <Properties>
            <Name>МояРоль</Name>
            <Synonym>
                <v8:item>
                    <v8:lang>ru</v8:lang>
                    <v8:content>Моя роль</v8:content>
                </v8:item>
            </Synonym>
            <Comment/>
        </Properties>
    </Role>
</MetaDataObject>
```

**Roles/МояРоль/Ext/Rights.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Rights xmlns="http://v8.1c.ru/8.2/roles" xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:type="Rights" version="2.17">
    <setForNewObjects>false</setForNewObjects>
    <setForAttributesByDefault>true</setForAttributesByDefault>
    <independentRightsOfChildObjects>false</independentRightsOfChildObjects>
</Rights>
```

### Роль для регламентного задания

Типичный набор прав для фонового задания, работающего со справочниками и регистрами:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Rights xmlns="http://v8.1c.ru/8.2/roles" xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:type="Rights" version="2.17">
    <setForNewObjects>false</setForNewObjects>
    <setForAttributesByDefault>true</setForAttributesByDefault>
    <independentRightsOfChildObjects>false</independentRightsOfChildObjects>
    <object>
        <name>Catalog.Номенклатура</name>
        <right>
            <name>Read</name>
            <value>true</value>
        </right>
    </object>
    <object>
        <name>Catalog.Контрагенты</name>
        <right>
            <name>Read</name>
            <value>true</value>
        </right>
    </object>
    <object>
        <name>InformationRegister.ЦеныНоменклатуры</name>
        <right>
            <name>Read</name>
            <value>true</value>
        </right>
        <right>
            <name>Update</name>
            <value>true</value>
        </right>
    </object>
    <object>
        <name>DataProcessor.ОбновлениеЦен</name>
        <right>
            <name>Use</name>
            <value>true</value>
        </right>
    </object>
</Rights>
```

### Роль с запретом редактирования полей

```xml
<object>
    <name>Document.РеализацияТоваровУслуг</name>
    <right>
        <name>Read</name>
        <value>true</value>
    </right>
    <right>
        <name>View</name>
        <value>true</value>
    </right>
</object>
<object>
    <name>Document.РеализацияТоваровУслуг.StandardAttribute.Posted</name>
    <right>
        <name>Edit</name>
        <value>false</value>
    </right>
</object>
<object>
    <name>Document.РеализацияТоваровУслуг.StandardAttribute.DeletionMark</name>
    <right>
        <name>Edit</name>
        <value>false</value>
    </right>
</object>
```

---

## Версии формата

| Платформа | version (метаданные) | version (Rights.xml) | Изменения |
|-----------|:--------------------:|:--------------------:|-----------|
| 8.3.24 | 2.17 | 2.17 | Базовая (нижняя граница проверенного диапазона) |
| 8.3.25 | 2.18 | 2.18 | Только номер версии |
| 8.3.26 | 2.19 | 2.19 | Право, совпадающее с `setForNewObjects`, больше не пишется (см. ниже) |
| 8.3.27 | 2.20 | 2.20 | Только номер версии |
| 8.5.1 | 2.21 | 2.21 | Только номер версии |

Полная лестница платформа → версия формата, включая ступени ниже проверенного диапазона, — [1c-configuration-spec.md §7.1](1c-configuration-spec.md#71-лестница-версий).

Начиная с `2.19` платформа **опускает право, значение которого совпадает с `<setForNewObjects>`** в шапке `Rights.xml`: роль с `setForNewObjects=true` теряет из выгрузки права со значением `true`, роль с `false` — со значением `false`. Возможности не удалялись: право отсутствует в выгрузке, но действует по умолчанию роли. Структура файла при этом не менялась.

Namespace Rights.xml (`http://v8.1c.ru/8.2/roles`) и namespace метаданных (`http://v8.1c.ru/8.3/MDClasses`) не менялись.
