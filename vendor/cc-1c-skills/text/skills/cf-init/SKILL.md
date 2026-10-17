> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `cf-init`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
Создать пустую конфигурацию 1С (scaffold XML-исходников). Используй когда нужно начать новую конфигурацию с нуля


# /cf-init — Создание пустой конфигурации 1С

Создаёт scaffold исходников пустой конфигурации 1С: `Configuration.xml`, `Languages/Русский.xml`.

## Параметры и команда

| Параметр | Описание |
|----------|----------|
| `Name` | Имя конфигурации (обязат.) |
| `Synonym` | Синоним (= Name если не указан) |
| `OutputDir` | Каталог для создания (default: `src`) |
| `Version` | Версия конфигурации |
| `Vendor` | Поставщик |
| `CompatibilityMode` | Режим совместимости (default: `Version8_3_24`) |
| `FormatVersion` | Версия формата выгрузки (default: `2.17`) |

Оба параметра задаются от **целевой платформы** — той, на которой конфигурация будет работать, — но по
разным правилам.

`FormatVersion` — **не выше** версии формата целевой платформы: 8.3.24 — `2.17`, 8.3.25 — `2.18`,
8.3.26 — `2.19`, 8.3.27 — `2.20`, 8.5 — `2.21`. Ниже брать можно: платформа читает свой формат и любой
более старый, поэтому дефолт `2.17` подходит для всей линейки 8.3.24 и выше.

`CompatibilityMode` влияет на доступную функциональность. Если в задаче не оговорено иное — **равен
целевой платформе** (`Version8_3_27` для 8.3.27); это то же самое, что «Не использовать» в
Конфигураторе, и именно такое значение платформа проставляет новой базе. Более низкий режим берут
осознанно — когда конфигурация должна работать и на старых платформах; он отключает возможности,
появившиеся позже. Выше целевой платформы — нельзя: такая конфигурация загрузится, но работать на ней
не будет.

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Примеры

> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.

## Верификация

```
/cf-init TestConfig -OutputDir test-tmp/cf
/cf-info test-tmp/cf          — проверить созданное
/cf-validate test-tmp/cf      — валидировать
```
