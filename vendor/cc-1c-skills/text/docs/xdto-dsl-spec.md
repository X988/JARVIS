> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (guide). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Спецификация XDTO DSL — XML Schema как формат описания пакета

Навыки `/xdto-compile` (XSD → пакет) и `/xdto-decompile` (пакет → XSD) используют в качестве
формата описания **обычную XML-схему**. Отдельного DSL нет: XSD и модель XDTO выражают одно и
то же, различаясь синтаксисом и умолчаниями, а схема в реальных задачах обычно уже есть —
прислана контрагентом.

> Формат самих исходников (`Package.bin`, объект метаданных, схема префиксов) —
> [1c-xdto-spec.md](1c-xdto-spec.md).

## Пример

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:tns="urn:1C.ru:ObmenSBankom"
           targetNamespace="urn:1C.ru:ObmenSBankom"
           elementFormDefault="qualified">
    <xs:simpleType name="СуммаТип">
        <xs:restriction base="xs:decimal">
            <xs:totalDigits value="18"/>
            <xs:fractionDigits value="2"/>
        </xs:restriction>
    </xs:simpleType>

    <xs:complexType name="Платёж">
        <xs:sequence>
            <xs:element name="Дата" type="xs:date"/>
            <xs:element name="Сумма" type="tns:СуммаТип"/>
            <xs:element name="Назначение" type="xs:string" minOccurs="0"/>
        </xs:sequence>
        <xs:attribute name="Номер" type="xs:string"/>
    </xs:complexType>
</xs:schema>
```

---

## 1. Таблица соответствий

| XML Schema | Модель XDTO |
|---|---|
| `xs:schema/@targetNamespace` | `package/@targetNamespace` |
| `elementFormDefault="qualified"` | `elementFormQualified="true"` |
| `attributeFormDefault="qualified"` | `attributeFormQualified="true"` |
| `xs:import/@namespace` | `import/@namespace` |
| `xs:complexType` | `objectType` |
| `xs:simpleType` | `valueType` |
| `xs:element` (глобальный) | `property` в `package` |
| `xs:attribute` (глобальный) | `property form="Attribute"` в `package` |
| `xs:element` (локальный) | `property` |
| `xs:attribute` (локальный) | `property form="Attribute"` |
| `@minOccurs` | `@lowerBound` |
| `@maxOccurs="unbounded"` | `@upperBound="-1"` |
| `@nillable`, `@default` | те же имена |
| `@fixed="V"` | `@fixed="true"` + `@default="V"` — в модели признак и значение разнесены |
| `xs:element/@ref` | `property/@ref` |
| анонимный `xs:simpleType` в объявлении | `typeDef xsi:type="ValueType"` |
| анонимный `xs:complexType` в объявлении | `typeDef xsi:type="ObjectType"` |
| `xs:complexContent/xs:extension/@base` | `objectType/@base` |
| `@abstract="true"`, `@mixed="true"` | те же имена |
| `xs:choice` | `ordered="false"` |
| `xs:sequence` | порядок по умолчанию |
| `xs:any` + `xs:anyAttribute` | `open="true"` |
| `xs:simpleContent/xs:extension/@base` | свойство `__content` с `form="Text"` |
| `xs:restriction/@base` + дочерние фасеты | `@base` + фасеты **атрибутами** |
| `xs:pattern`, `xs:enumeration` | `<pattern>`, `<enumeration>` — значение в тексте узла |
| `xs:list/@itemType` | `variety="List"` + `@itemType` |
| `xs:union/@memberTypes` | `variety="Union"` + `@memberTypes` |

Ловушки, на которых модель ошибается чаще всего:

- **Кратность инвертирована по смыслу**: `lowerBound="0"` = необязательный, `upperBound="-1"` = неограниченный.
- **Фасеты в XDTO — атрибуты**, а не дочерние элементы: `maxLength="30"`, не `<xs:maxLength value="30"/>`.
- **Каждая ссылка на тип требует локального объявления префикса** `dNpM` — в том числе на
  собственный `targetNamespace`.

Всё это делает компилятор; писать вручную ничего из перечисленного не нужно.

---

## 2. Аннотации `xdto:`

Две вещи XDTO выражает, а XML Schema — нет:

- `nillable` у атрибута (спецификация XSD допускает его только у элементов);
- `qualified` у отдельного свойства.

Плюс XSD не различает «атрибут записан явно» и «атрибут опущен, действует умолчание»,
хотя в реальных пакетах встречаются оба написания одного смысла.

Такие случаи описываются атрибутами из пространства имён самой модели XDTO —
`http://v8.1c.ru/8.1/xdto`. Правило одно:

> **Чего XSD сказать не может — пиши атрибутом `xdto:` с тем же именем, что в `Package.bin`.**

```xml
<xs:attribute name="Представление" type="xs:string"
              xmlns:xdto="http://v8.1c.ru/8.1/xdto" xdto:nillable="true"/>
```

Такая схема остаётся валидной: XML Schema разрешает атрибуты из чужих пространств имён
на объявлениях (`anyAttribute namespace="##other"` в схеме схем). Валидаторы их игнорируют.

Аннотации строго опциональны — подавляющее большинство схем обходится без единой.

| Аннотация | Где | Назначение |
|---|---|---|
| `xdto:nillable` | `xs:attribute` | `nillable` у свойства-атрибута |
| `xdto:lowerBound`, `xdto:upperBound` | `xs:attribute` | кратность свойства-атрибута |
| `xdto:qualified` | объявление | переопределение `*FormQualified` |
| `xdto:form` | `xs:element` | записать `form` явно (например `form="Element"`) |
| `xdto:name` | объявление | имя свойства, если XML-имя не является идентификатором 1С; тогда XML-имя уходит в `localName` |
| `xdto:variety` | `xs:restriction`, `xs:list`, `xs:union` | записать `variety` явно |
| `xdto:memberTypesForm="prefixed"` | `xs:union` | писать `memberTypes` префиксами, а не нотацией Кларка |
| `xdto:open`, `xdto:abstract`, `xdto:mixed`, `xdto:ordered`, `xdto:sequenced` | `xs:complexType` | значения, не выводимые из модели содержимого |
| `xdto:order` | `xs:complexType` | исходный порядок свойств, если он не «атрибуты первыми»; имена через `\|` |
| `xdto:textName`, `xdto:textlowerBound`, `xdto:textupperBound`, `xdto:textnillable` | `xs:extension` в `xs:simpleContent` | параметры свойства `form="Text"`, если оно названо не `__content` |
| `xdto:elementFormQualified`, `xdto:attributeFormQualified` | `xs:schema` | записать флаги явно |
| `xdto:fixed` | объявление | признак фиксированного значения отдельно от самого значения: в XSD `fixed="V"` совмещает их, в модели это `fixed="true"` + `default="V"`. Нужен только для `fixed="false"` при заданном `default` |
| `xdto:type` | `xs:enumeration` | `xsi:type` литерала перечисления |
| `xdto:prefix` | объявление | осмысленный префикс пространства имён вместо генерируемого `dNpM` (например `dcsset`) |
| `xdto:declareNs` | `xs:union` | объявить префикс пространства имён на узле (при нотации Кларка платформа иногда его пишет, иногда нет) |

### Что выводится само

Аннотация нужна только там, где вывод невозможен:

| Свойство XDTO | Выводится из |
|---|---|
| `open="true"` | наличие `xs:any` / `xs:anyAttribute` |
| `ordered="false"` | `xs:choice` вместо `xs:sequence` |
| `abstract`, `mixed` | одноимённые атрибуты `xs:complexType` |
| `variety="List"` / `"Union"` | `xs:list` / `xs:union` |
| порядок свойств | атрибуты первыми, затем остальные |

`sequenced` из XSD не выводится (в корпусе он не коррелирует однозначно ни с одной
конструкцией) и всегда приходит аннотацией.

---

## 3. Свойства объекта метаданных

`Name`, `Synonym` и `Comment` живут в `xs:annotation/xs:appinfo` — штатном месте XML Schema
для инструментальных метаданных. `Namespace` не дублируется: его единственный источник —
`targetNamespace`.

```xml
<xs:annotation>
    <xs:appinfo>
        <xdto:package xmlns:xdto="http://v8.1c.ru/8.1/xdto">
            <xdto:name>ОбменСБанком</xdto:name>
            <xdto:synonym lang="ru">Обмен с банком</xdto:synonym>
            <xdto:comment>Формат 1С:Предприятие — Клиент банка</xdto:comment>
        </xdto:package>
    </xs:appinfo>
</xs:annotation>
```

Блок опционален. Параметры `-Name`, `-Synonym`, `-Comment` навыка `/xdto-compile`
имеют приоритет над ним. Без того и другого имя берётся из имени файла XSD.

Благодаря этому блоку пара `/xdto-decompile` → `/xdto-compile` замыкается без потерь,
включая свойства объекта метаданных.

---

## 4. Прощающий ввод

Компилятор принимает и не вполне канонические схемы:

- **Имя типа без префикса** (`type="Платёж"`) трактуется как тип целевого пространства имён.
- **`form="qualified"` на глобальном объявлении** — так экспортирует XML-схему сам
  Конфигуратор, хотя спецификация XSD допускает `form` только у локальных объявлений.
  Такие файлы читаются; сам навык пишет корректно.
- **Порядок объявлений верхнего уровня произвольный** — компилятор расставляет их
  в требуемом моделью порядке `import → property → valueType → objectType`.
- **`xs:group` и `xs:attributeGroup`** раскрываются по ссылке: содержимое группы
  подставляется в тип.

## 5. Конструкции без точного соответствия

XML Schema выразительнее модели XDTO. Перечисленное ниже переносится приближённо,
и компилятор об этом **предупреждает** — молча терять свойства нельзя.

| Конструкция | Что происходит |
|---|---|
| вложенная `xs:sequence` | уплощается в плоский список свойств |
| вложенная `xs:choice` | уплощается, и **ветки становятся необязательными**: иначе «одно из двух» превратилось бы в «оба обязательны» и тип нельзя было бы заполнить. Запрет «ровно один из» не сохраняется |
| `xs:all` | трактуется как последовательность |
| `minOccurs`/`maxOccurs` на самой частице | не выражается, отбрасывается |
| `substitutionGroup` | объявление сохраняется как обычное |
| `xs:key`, `xs:keyref`, `xs:unique` | отбрасываются |
| `xs:redefine` | игнорируется |
| `xs:include` | игнорируется: зависимости разрешаются только по namespace — включаемую схему нужно собрать отдельным пакетом и заменить на `xs:import` |

`ordered="false"` (выбор одного из вариантов) выводится только из **корневой** `xs:choice`
типа: модель хранит признак на типе целиком, а не на вложенной частице.
