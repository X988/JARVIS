> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `role-validate`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Валидация роли 1С. Используй после создания или модификации роли для проверки корректности


# /role-validate — валидация роли 1С

Проверяет корректность `Rights.xml` роли: формат XML, namespace, глобальные флаги, типы объектов, имена прав, RLS-ограничения, шаблоны. Опционально проверяет метаданные роли (UUID, имя, синоним).

## Параметры

| Параметр     | Обяз. | Умолч. | Описание                                        |
|--------------|:-----:|---------|-------------------------------------------------|
| RightsPath   | да    | —       | Путь к роли (директория или `Rights.xml`)        |
| Detailed     | нет   | —       | Подробный вывод (все проверки, включая успешные)  |
| MaxErrors    | нет   | 30      | Макс. ошибок до остановки (по умолчанию 30)      |
| OutFile      | нет   | —       | Записать результат в файл (UTF-8 BOM)            |

## Команда

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Что считается ошибкой

Ошибка (код возврата 1), а не предупреждение:

- тип объекта, не имеющий прав в ролях (`Enum`, `CommonModule`, `CommonPicture`, `ScheduledJob` и т.п.) — конфигурация с блоком прав на перечисление не загружается в базу, конфигуратор зависает без сообщений;
- незнакомый тип объекта (опечатка);
- имя права, которого у этого типа нет;
- вид вложенности, невозможный у данного типа, и недопустимое право у вложенного объекта;
- право на сервис целиком (`HTTPService.Имя` и т.п.) — платформа проверяет вложенный объект (метод шаблона URL, операцию, канал), а роль с правом на корень молча не работает: маршруты отвечают `403 Недостаточно прав`.

Полные списки «тип → права» и виды вложенности — в `role-compile/dsl-reference.md`.
