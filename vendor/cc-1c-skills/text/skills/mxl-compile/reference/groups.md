> JARVIS_ONEC_SKILL_DOCS_ONLY: scripts are not installed and must not be run. Mutations stay on the JARVIS policy pipeline and require approval.
> Source: cc-1c-skills `24429b462509` (skill `mxl-compile`). Copyright (c) 2025-2026 Nick Shirokov. MIT — see vendor/cc-1c-skills/LICENSE.
> Adapted for JARVIS: command blocks and credential examples removed. This file is prompt context only.
# Группы строк и колонок

Диапазон строк или колонок, который сворачивается кнопкой на полях. Задаются плоским списком;
вложенность выражена вхождением одного диапазона в другой:

```json
"rowGroups": [
  { "rows": "2-4" },
  { "rows": 3 },
  { "rows": 5, "name": "Итоговая", "collapsed": true, "titleLocation": "begin" }
],
"columnGroups": [
  { "cols": "2-3", "name": { "ru": "Показатели", "en": "Values" } },
  { "cols": 3 }
]
```

| Поле | Обяз. | По умолч. | Описание |
|------|:-----:|-----------|----------|
| `rows` / `cols` | да | — | Диапазон 1-based: число или `"N-M"` |
| `name` | нет | — | Имя группы: строка или объект «язык → текст» |
| `collapsed` | нет | `false` | Свёрнута ли группа при открытии |
| `titleLocation` | нет | `auto` | Расположение заголовка: `begin`, `end`, `auto` |

Диапазоны либо вложены, либо не пересекаются: частичное пересечение — ошибка. Порядок в списке
не важен, число уровней вложенности считается само.
