> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `xdto-decompile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Выгрузка пакета XDTO 1С в XML-схему (XSD). Используй когда нужно получить схему существующего пакета — чтобы переработать её целиком, отдать контрагенту или перенести пакет в другую конфигурацию


# /xdto-decompile — Выгрузка пакета XDTO в XML-схему

Превращает пакет XDTO в обычную XML-схему — читаемую и редактируемую.
Заменяет чтение `Ext/Package.bin` напрямую.

## Параметры

| Параметр | Обязательный | Описание |
|----------|--------------|----------|
| `PackagePath` | да | Каталог пакета, путь к `Ext/Package.bin` или к `<Имя>.xml` объекта метаданных. Псевдоним — `-Path` |
| `OutFile` | нет | Записать схему в файл (UTF-8 с BOM). Без него — вывод в stdout |

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

Примеры:
> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Переработка схемы целиком

`/xdto-decompile` → правка XSD → `/xdto-compile -Force` возвращает пакет без потерь,
включая имя, синоним и комментарий объекта метаданных — они выгружаются
в `xs:annotation/xs:appinfo`.

Этот же путь даёт версионную копию пакета: смени в схеме `targetNamespace` и собери
её с `-Name` нового пакета — имя и синоним задаются флагами `/xdto-compile`, внутри
схемы их править не нужно. Меняя пространство имён, поправь **и объявление `xmlns`
с тем же URI**: внутренние ссылки пользуются им как префиксом. Заменять все вхождения
строки нельзя — пострадает импорт пространства имён, для которого старый URI является
префиксом (`urn:пример:обмен` и `urn:пример:обмен:legacy`).

Этот путь нужен, когда схему меняют широко или сначала надо разобраться, как она
устроена. Чтобы поправить одно свойство, схему целиком читать не нужно — `/xdto-edit`.
Если нужна не схема, а сводка «что присвоить и что обязательно», — `/xdto-info`.

В схеме могут встретиться атрибуты с префиксом `xdto:` — так записано то, что
XML Schema выразить не может (например `nillable` у атрибута). Схема при этом остаётся
валидной, валидаторы такие атрибуты игнорируют. Трогать их обычно не нужно; смысл
каждого описан в `xsd-reference.md` навыка `/xdto-compile`.

## Передача схемы наружу

Полученную XSD можно отдавать контрагенту как есть — она валидна и не теряет
данных пакета. Штатная команда «Экспорт XML-схемы» в Конфигураторе для этого
хуже: она теряет `nillable` у свойств-атрибутов.
