> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `form-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Табличный документ на форме

Поле табличного документа — для отчёта или печатной формы на форме. Привязывается к реквизиту типа `mxl:SpreadsheetDocument`.

```json
{
  "elements": [
    { "spreadsheet": "ТаблицаОтчета", "path": "ТаблицаОтчета", "titleLocation": "none",
      "readOnly": true, "output": "Disable", "protection": true }
  ],
  "attributes": [
    { "name": "ТаблицаОтчета", "type": "mxl:SpreadsheetDocument" }
  ]
}
```

| Ключ | Значения | Назначение |
|------|----------|-----------|
| `output` | `Enable` / `Disable` | Разрешить вывод (печать, сохранение) |
| `protection` | bool | Защита ячеек от изменения |
| `edit` | bool | Разрешить редактирование |
| `showGrid` | bool | Сетка |
| `showHeaders` | bool | Заголовки строк и колонок |
| `showGroups` | bool | Группировки |
| `showRowAndColumnNames` / `showCellNames` | bool | Имена строк, колонок, ячеек |
| `verticalScrollBar` / `horizontalScrollBar` | `true` / `false` | Полосы прокрутки |
| `viewScalingMode` | `Normal` / … | Масштаб просмотра |
| `selectionShowMode` | `WhenActive` / `DontShow` / `WhenMultipleCellsSelected` | Когда показывать выделение |
| `excludedCommands` | массив | Убрать команды панели табличного документа: `AlignCenter`, `Bold`, `BorderAll`, `BackColor`, … |

Также — общие свойства поля: `title`, `titleLocation`, `readOnly`, размеры, растягивание, события.

Макет печатной формы создаётся навыком `/mxl-compile`, документ заполняется в модуле формы.
