export type BslHit = {
  rule: string;
  line: number;
  message: string;
};

export type BslReport = {
  adapter: "fallback" | "not-configured";
  ok: boolean;
  hits: BslHit[];
  note: string;
};

const DANGER =
  /Выполнить\s*\(|Вычислить\s*\(|ЗапуститьПриложение\s*\(|НачатьЗапускПриложения\s*\(|COMОбъект|WScript\.Shell|КопироватьФайл\s*\(|УдалитьФайлы\s*\(|HTTPСоединение|FTPСоединение/;

export function checkBsl(source: string): BslReport {
  const lines = source.split(/\r?\n/);
  const hits: BslHit[] = [];
  const procedures = new Map<string, number>();
  let context: "client" | "server" | "unknown" = "unknown";
  lines.forEach((line, index) => {
    const n = index + 1;
    const trimmed = line.trim();
    if (/^&НаКлиенте/i.test(trimmed)) context = "client";
    if (/^&НаСервере/i.test(trimmed)) context = "server";
    if (DANGER.test(line)) {
      hits.push({ rule: "dangerous-call", line: n, message: "Опасный вызов. В расширение его не кладём." });
    }
    if (/УстановитьПривилегированныйРежим\s*\(\s*Истина/i.test(line)) {
      hits.push({ rule: "privileged", line: n, message: "Привилегированный режим для этой учётки закрыт." });
    }
    const named = /^(Процедура|Функция)\s+([A-Za-zА-Яа-я0-9_]+)/.exec(trimmed);
    if (named) {
      const key = named[2].toLowerCase();
      const prev = procedures.get(key);
      if (prev) hits.push({ rule: "duplicate", line: n, message: `Имя «${named[2]}» уже есть на строке ${prev}.` });
      else procedures.set(key, n);
      if (context === "client" && /Записать\s*\(|Провести\s*\(/.test(trimmed)) {
        hits.push({ rule: "client-write", line: n, message: "Запись с клиента в этом контуре не принимается." });
      }
    }
    if (trimmed.includes("\u0000")) hits.push({ rule: "syntax", line: n, message: "В строке нулевой байт." });
  });
  const opens = (source.match(/\bПроцедура\b|\bФункция\b/g) ?? []).length;
  const closes = (source.match(/\bКонецПроцедуры\b|\bКонецФункции\b/g) ?? []).length;
  if (opens !== closes) {
    hits.push({ rule: "syntax", line: lines.length, message: "Число процедур и концов не сходится." });
  }
  return {
    adapter: "fallback",
    ok: hits.length === 0,
    hits,
    note: "BSL Language Server в этой среде нет. Проверка — встроенный fallback, не замена конфигуратору.",
  };
}

export interface BslValidator {
  id: string;
  check(source: string): BslReport;
}

export class FallbackBslValidator implements BslValidator {
  readonly id = "fallback";
  check(source: string): BslReport {
    return checkBsl(source);
  }
}

export class BslLanguageServerValidator implements BslValidator {
  readonly id = "bsl-language-server";
  check(_source: string): BslReport {
    return {
      adapter: "not-configured",
      ok: false,
      hits: [],
      note: "BSL Language Server не установлен. Это не полная проверка 1С. Статус NOT_CONFIGURED.",
    };
  }
}

export class OneCDesignerValidator implements BslValidator {
  readonly id = "1cv8";
  check(_source: string): BslReport {
    return { adapter: "not-configured", ok: false, hits: [], note: "Конфигуратор 1cv8 не вызывался. Статус NOT_CONFIGURED." };
  }
}
