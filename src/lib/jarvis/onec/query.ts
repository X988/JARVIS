export type QueryNote = { rule: string; message: string };

export function analyzeQuery(text: string): { ok: boolean; notes: QueryNote[] } {
  const source = text.replace(/\s+/g, " ").trim();
  const notes: QueryNote[] = [];
  if (!/ВЫБРАТЬ/i.test(source)) notes.push({ rule: "syntax", message: "Нет ВЫБРАТЬ. Это не текст запроса." });
  if (/ВЫБРАТЬ\s+\*/i.test(source)) notes.push({ rule: "fields", message: "Звёздочка тянет лишние поля." });
  if (/СОЕДИНЕНИЕ/i.test(source) && !/ПО\s+/i.test(source)) notes.push({ rule: "join", message: "Соединение без ПО." });
  if (/ВИРТУАЛЬН|ОБОРОТЫ|ОСТАТКИ|СРЕЗПОСЛЕДНИХ/i.test(source) && !/\{|ПАРАМЕТР|&/i.test(source) && !/ГДЕ/i.test(source)) {
    notes.push({ rule: "virtual", message: "Виртуальная таблица без отбора и без параметров." });
  }
  if (/ПОМЕСТИТЬ/i.test(source) && !/УНИЧТОЖИТЬ|ИНДЕКСИРОВАТЬ/i.test(source)) {
    notes.push({ rule: "temp", message: "Временная таблица без индекса и без уничтожения. Проверьте пакет." });
  }
  if (!/ГДЕ/i.test(source) && /ИЗ\s+/i.test(source)) notes.push({ rule: "filter", message: "Нет ГДЕ. На большом регистре это тяжёлый запрос." });
  if (/["']\s*\+|%\s*\+|СтрЗаменить\s*\([^)]*ВЫБРАТЬ/i.test(source) || /ВЫПОЛНИТЬ\s*\(\s*[^)]*\+/i.test(text)) {
    notes.push({ rule: "dynamic", message: "Текст запроса склеивается. Так делать нельзя." });
  }
  const params = new Set<string>();
  for (const match of source.matchAll(/&([A-Za-zА-Яа-я0-9_]+)/g)) params.add(match[1]);
  return {
    ok: notes.every((item) => item.rule !== "dynamic" && item.rule !== "join" && item.rule !== "syntax"),
    notes: [...notes, { rule: "params", message: params.size ? `Параметры: ${[...params].join(", ")}.` : "Параметров нет." }],
  };
}
