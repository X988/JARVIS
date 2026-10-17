export type BslHit = {
  rule: string;
  line: number;
  message: string;
  severity?: "error" | "warning";
};

export type BslRule = {
  id: string;
  severity: "error" | "warning";
  line: number;
  message: string;
};

export type BslReport = {
  adapter: "fallback" | "not-configured";
  ok: boolean;
  hits: BslHit[];
  rules: BslRule[];
  note: string;
};

const CLIENT_DIRECTIVES = ["&наклиенте", "&наклиентенасерверебезконтекста"];
const SERVER_DIRECTIVES = ["&насервере", "&насерверебезконтекста"];

const WRITE_CALLS = ["записать", "провести", "удалить", "начатьтранзакцию"];

function stripCommentsAndStrings(line: string): string {
  // Remove // comments
  let s = line.replace(/\/\/.*$/, "");
  // Remove "..." strings (simple, no nested)
  s = s.replace(/"(?:[^"]|"")*"/g, '""');
  // Remove '...' dates
  s = s.replace(/'[^']*'/g, "''");
  return s;
}

export function checkBsl(source: string): BslReport {
  const rawLines = source.split(/\r?\n/);
  const hits: BslHit[] = [];
  const rules: BslRule[] = [];

  const add = (rule: string, line: number, message: string, severity: "error" | "warning" = "error") => {
    hits.push({ rule, line, message, severity });
    rules.push({ id: rule, severity, line, message });
  };

  let pendingContext: "client" | "server" | "unknown" = "unknown";
  let currentArea = "";
  const seenNames = new Map<string, number>(); // key: area|nameLower -> line
  const blockStack: Array<{ kind: string; line: number }> = [];

  let inProc = false;
  let procContext: "client" | "server" | "unknown" = "unknown";
  let procName = "";

  for (let i = 0; i < rawLines.length; i++) {
    const n = i + 1;
    const raw = rawLines[i];
    const trimmed = raw.trim();
    const clean = stripCommentsAndStrings(raw).trim();

    if (!clean && !trimmed.startsWith("&") && !trimmed.startsWith("#")) continue;

    // Directives
    if (trimmed.startsWith("&")) {
      const d = trimmed.toLowerCase();
      if (CLIENT_DIRECTIVES.some((c) => d.startsWith(c))) pendingContext = "client";
      else if (SERVER_DIRECTIVES.some((c) => d.startsWith(c))) pendingContext = "server";
      continue;
    }

    // Preprocessor
    if (trimmed.startsWith("#")) {
      const p = trimmed.toLowerCase();
      if (p.startsWith("#область")) {
        const m = /#область\s+(.+)/i.exec(trimmed);
        currentArea = m ? m[1].trim() : "";
      } else if (p.startsWith("#конецобласти")) {
        currentArea = "";
      }
      continue;
    }

    // Dangerous (on clean line)
    if (/Выполнить\s*\(|Вычислить\s*\(|ЗапуститьПриложение\s*\(|НачатьЗапускПриложения\s*\(|COMОбъект|WScript\.Shell|КопироватьФайл\s*\(|УдалитьФайлы\s*\(|HTTPСоединение|FTPСоединение/i.test(clean)) {
      add("dangerous-call", n, "Опасный вызов. В расширение его не кладём.");
    }
    if (/УстановитьПривилегированныйРежим\s*\(\s*Истина/i.test(clean)) {
      add("privileged", n, "Привилегированный режим для этой учётки закрыт.");
    }

    // Procedure / Function start
    const procMatch = /^(Процедура|Функция)\s+([A-Za-zА-Яа-я_][A-Za-zА-Яа-я0-9_]*)/i.exec(clean);
    if (procMatch) {
      const kind = procMatch[1].toLowerCase();
      procName = procMatch[2];
      const key = `${currentArea.toLowerCase()}|${procName.toLowerCase()}`;
      const prev = seenNames.get(key);
      if (prev) {
        add("duplicate", n, `Имя «${procName}» уже объявлено в области «${currentArea || "корень"}» на строке ${prev}.`);
      } else {
        seenNames.set(key, n);
      }
      blockStack.push({ kind, line: n });
      inProc = true;
      procContext = pendingContext;
      pendingContext = "unknown";
      continue;
    }

    // Ends
    if (/^КонецПроцедуры/i.test(clean) || /^КонецФункции/i.test(clean)) {
      const expected = clean.toLowerCase().includes("процедуры") ? "процедура" : "функция";
      if (blockStack.length === 0 || blockStack[blockStack.length - 1].kind !== expected) {
        add("syntax", n, `Несбалансированный ${clean.split(/\s/)[0]}.`);
      } else {
        blockStack.pop();
      }
      inProc = false;
      procContext = "unknown";
      continue;
    }

    if (/^Если(\s|$)/i.test(clean)) blockStack.push({ kind: "если", line: n });
    if (/^КонецЕсли/i.test(clean)) {
      if (blockStack.length === 0 || blockStack[blockStack.length - 1].kind !== "если") {
        add("syntax", n, "Несбалансированный КонецЕсли.");
      } else blockStack.pop();
    }

    if (/^(Для|Пока)(\s|$)/i.test(clean)) blockStack.push({ kind: "цикл", line: n });
    if (/^КонецЦикла/i.test(clean)) {
      if (blockStack.length === 0 || blockStack[blockStack.length - 1].kind !== "цикл") {
        add("syntax", n, "Несбалансированный КонецЦикла.");
      } else blockStack.pop();
    }

    if (/^Попытка(\s|$)/i.test(clean)) blockStack.push({ kind: "попытка", line: n });
    if (/^КонецПопытки/i.test(clean)) {
      if (blockStack.length === 0 || blockStack[blockStack.length - 1].kind !== "попытка") {
        add("syntax", n, "Несбалансированный КонецПопытки.");
      } else blockStack.pop();
    }

    // client-write inside procedure body
    if (inProc && procContext === "client") {
      for (const meth of WRITE_CALLS) {
        // Avoid \b — it does not work with Cyrillic in JS
        const re = new RegExp(`(?:^|[^A-Za-zА-Яа-я0-9_])${meth}\\s*\\(`, "i");
        if (re.test(clean) && !new RegExp(`^(Процедура|Функция)\\s+${meth}`, "i").test(clean)) {
          add("client-write", n, `Вызов ${meth}() в клиентском контексте.`);
        }
      }
    }

    if (raw.includes("\0")) add("syntax", n, "В строке нулевой байт.");
  }

  // Unclosed
  for (const b of blockStack) {
    add("syntax", b.line, `Не закрыт блок «${b.kind}» (строка ${b.line}).`);
  }

  const ok = hits.every((h) => h.severity === "warning");

  return {
    adapter: "fallback",
    ok,
    hits,
    rules,
    note: "BSL Language Server в этой среде нет. Проверка — встроенный fallback (FALLBACK_ONLY), не замена конфигуратору.",
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
      rules: [],
      note: "BSL Language Server не установлен. Это не полная проверка 1С. Статус NOT_CONFIGURED.",
    };
  }
}

export class OneCDesignerValidator implements BslValidator {
  readonly id = "1cv8";
  check(_source: string): BslReport {
    return {
      adapter: "not-configured",
      ok: false,
      hits: [],
      rules: [],
      note: "Конфигуратор 1cv8 не вызывался. Статус NOT_CONFIGURED.",
    };
  }
}
