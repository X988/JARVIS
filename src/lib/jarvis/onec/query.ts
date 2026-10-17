export type QueryNote = { rule: string; message: string; severity?: "error" | "warning"; line?: number };

export type QueryReport = {
  ok: boolean;
  notes: QueryNote[];
  errors: QueryNote[];
  warnings: QueryNote[];
};

function splitQueries(text: string): string[] {
  // Simple split by ; not inside strings
  const parts: string[] = [];
  let current = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inStr = !inStr;
    if (c === ";" && !inStr) {
      parts.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

export function analyzeQuery(text: string): QueryReport {
  const queries = splitQueries(text);
  const notes: QueryNote[] = [];
  const errors: QueryNote[] = [];
  const warnings: QueryNote[] = [];

  const add = (rule: string, message: string, severity: "error" | "warning" = "warning", line?: number) => {
    const n: QueryNote = { rule, message, severity, line };
    notes.push(n);
    if (severity === "error") errors.push(n);
    else warnings.push(n);
  };

  if (queries.length === 0 || !/ВЫБРАТЬ/i.test(text)) {
    add("syntax", "Нет ВЫБРАТЬ. Это не текст запроса.", "error");
  }

  for (const q of queries) {
    const norm = q.replace(/\s+/g, " ").trim();

    // fields
    if (/ВЫБРАТЬ\s+\*/i.test(norm)) {
      add("fields", "Звёздочка тянет лишние поля.", "error");
    }

    // joins — ПО for EACH join
    const joinCount = (norm.match(/СОЕДИНЕНИЕ/gi) ?? []).length;
    const poCount = (norm.match(/\bПО\b/gi) ?? []).length;
    if (joinCount > poCount) {
      add("join", `Соединение без ПО (${joinCount} соединений, ${poCount} ПО).`, "error");
    }

    // virtual tables without parameters
    if (/ОСТАТКИ|ОБОРОТЫ|СРЕЗПОСЛЕДНИХ|ВИРТУАЛЬН/i.test(norm)) {
      if (!/\{|&|ГДЕ/i.test(norm)) {
        add("virtual", "Виртуальная таблица без параметров и без отбора.", "error");
      }
    }

    // temp
    if (/ПОМЕСТИТЬ/i.test(norm) && !/УНИЧТОЖИТЬ|ИНДЕКСИРОВАТЬ/i.test(norm)) {
      add("temp", "Временная таблица без индекса и без уничтожения.", "warning");
    }

    // filter
    if (!/ГДЕ/i.test(norm) && /ИЗ\s+/i.test(norm) && !/ПОМЕСТИТЬ/i.test(norm)) {
      add("filter", "Нет ГДЕ. На большом регистре это тяжёлый запрос.", "warning");
    }

    // РАЗРЕШЕННЫЕ
    if (/РАЗРЕШЕННЫЕ/i.test(norm)) {
      add("allowed", "Использование РАЗРЕШЕННЫЕ требует проверки прав.", "warning");
    }

    // ПЕРВЫЕ without УПОРЯДОЧИТЬ
    if (/ПЕРВЫЕ\s+\d+/i.test(norm) && !/УПОРЯДОЧИТЬ/i.test(norm)) {
      add("top-without-order", "ПЕРВЫЕ без УПОРЯДОЧИТЬ даёт нестабильный результат.", "error");
    }

    // UNION
    if (/ОБЪЕДИНИТЬ/i.test(norm)) {
      if (!/ОБЪЕДИНИТЬ\s+ВСЕ/i.test(norm)) {
        add("union", "ОБЪЕДИНИТЬ без ВСЕ может удалить дубликаты неожиданно.", "warning");
      }
    }

    // dynamic
    if (/["']\s*\+|%\s*\+|СтрЗаменить\s*\([^)]*ВЫБРАТЬ/i.test(norm) || /ВЫПОЛНИТЬ\s*\(\s*[^)]*\+/i.test(text)) {
      add("dynamic", "Текст запроса склеивается. Так делать нельзя.", "error");
    }

    // params
    const params = new Set<string>();
    for (const m of norm.matchAll(/&([A-Za-zА-Яа-я0-9_]+)/g)) params.add(m[1]);
    if (params.size > 0) {
      add("params", `Параметры без явных значений в тексте: ${[...params].join(", ")}.`, "warning");
    }
  }

  // Query in cycle — this requires BSL context; here we only note if the text itself contains the pattern
  if (/Для|Пока/i.test(text) && /Запрос\.Выполнить\s*\(/i.test(text)) {
    add("query-in-loop", "Вызов Запрос.Выполнить() внутри цикла (Для/Пока).", "error");
  }

  const ok = errors.length === 0;

  return { ok, notes, errors, warnings };
}
