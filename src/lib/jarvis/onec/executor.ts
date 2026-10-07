import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkBsl } from "./bsl.ts";
import { analyzeQuery } from "./query.ts";
import { validateOnecExport, type ValidationRunner } from "./validation.ts";

export type OnecEnv = "development" | "test" | "production";

export type OnecCode = "OK" | "DENY" | "NOT_FOUND" | "FAIL";

export type OnecResult = {
  ok: boolean;
  code: OnecCode;
  environment: OnecEnv;
  adapter: "file" | "mock";
  message: string;
  path?: string;
  diff?: string;
  detail?: unknown;
};

export type OnecKind = "module" | "form" | "command" | "attribute" | "template" | "print" | "report" | "processor";

function deny(environment: OnecEnv, adapter: OnecResult["adapter"], message: string): OnecResult {
  return { ok: false, code: "DENY", environment, adapter, message };
}

function jail(root: string, target: string): string | null {
  const base = path.resolve(root);
  const full = path.resolve(base, target);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function inside(base: string, candidate: string): boolean {
  return candidate === base || candidate.startsWith(base + path.sep);
}

function realRoot(root: string): string | null {
  try {
    const resolved = fs.realpathSync(root);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function safeExistingFile(root: string, target: string): string | null {
  const lexical = jail(root, target);
  const base = realRoot(root);
  if (!lexical || !base || !fs.existsSync(lexical)) return null;
  try {
    if (fs.lstatSync(lexical).isSymbolicLink()) return null;
    const real = fs.realpathSync(lexical);
    return inside(base, real) && fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

function safeWriteFile(root: string, target: string): string | null {
  const lexical = jail(root, target);
  const base = realRoot(root);
  if (!lexical || !base) return null;
  if (fs.existsSync(lexical)) return safeExistingFile(root, target);

  let ancestor = path.dirname(lexical);
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return null;
    ancestor = parent;
  }
  try {
    const realAncestor = fs.realpathSync(ancestor);
    if (!inside(base, realAncestor) || !fs.statSync(realAncestor).isDirectory()) return null;
    return lexical;
  } catch {
    return null;
  }
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function diffText(before: string, after: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`- ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
    if (lines.length > 80) break;
  }
  return lines.join("\n") || "(без отличий)";
}

export class FileOnecExecutor {
  readonly adapter = "file" as const;
  private readonly root: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly validationRunner?: ValidationRunner;

  constructor(
    root: string,
    options: { env?: NodeJS.ProcessEnv; validationRunner?: ValidationRunner } = {},
  ) {
    this.root = root;
    this.env = options.env ?? process.env;
    this.validationRunner = options.validationRunner;
  }

  private gate(environment: OnecEnv, write: boolean): OnecResult | null {
    if (environment === "production") {
      return deny(environment, this.adapter, "Production закрыт. Исполнитель работает только с development и test.");
    }
    if (!fs.existsSync(this.root)) {
      return { ok: false, code: "FAIL", environment, adapter: this.adapter, message: "Каталог выгрузки не найден." };
    }
    if (!realRoot(this.root)) {
      return { ok: false, code: "FAIL", environment, adapter: this.adapter, message: "Корень выгрузки не является безопасным каталогом." };
    }
    return null;
  }

  find(name: string, environment: OnecEnv): OnecResult {
    const blocked = this.gate(environment, false);
    if (blocked) return blocked;
    const needle = name.toLowerCase().trim();
    if (!needle || needle.length > 160) {
      return deny(environment, this.adapter, "Некорректная строка поиска.");
    }
    const hits: string[] = [];
    const maxFiles = boundedInt(this.env.JARVIS_ONEC_SEARCH_MAX_FILES, 10_000, 100, 50_000);
    const maxDepth = boundedInt(this.env.JARVIS_ONEC_SEARCH_MAX_DEPTH, 32, 1, 64);
    const maxFileBytes = boundedInt(this.env.JARVIS_ONEC_SEARCH_MAX_FILE_BYTES, 2 * 1024 * 1024, 4_096, 10 * 1024 * 1024);
    let inspected = 0;
    let truncated = false;
    const walk = (dir: string, depth: number): void => {
      if (truncated) return;
      if (depth > maxDepth) {
        truncated = true;
        return;
      }
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (truncated) break;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (!entry.isFile() || (!entry.name.endsWith(".xml") && !entry.name.endsWith(".bsl"))) continue;
        inspected += 1;
        if (inspected > maxFiles) {
          truncated = true;
          break;
        }
        const stat = fs.statSync(full);
        if (stat.size > maxFileBytes) continue;
        const fileName = entry.name.toLowerCase();
        const body = fs.readFileSync(full, "utf8").toLowerCase();
        const namedInMetadata = body.includes(`<name>${needle}</name>`);
        if (fileName.includes(needle) || namedInMetadata) hits.push(path.relative(this.root, full));
      }
    };
    walk(this.root, 0);
    if (truncated) {
      return { ok: false, code: "FAIL", environment, adapter: this.adapter, message: "Поиск остановлен безопасным лимитом; частичный результат не считается полным.", detail: { inspected, hits: hits.slice(0, 20) } };
    }
    if (hits.length === 0) return { ok: false, code: "NOT_FOUND", environment, adapter: this.adapter, message: "Объект в выгрузке не найден." };
    return { ok: true, code: "OK", environment, adapter: this.adapter, message: hits.slice(0, 20).join(", "), detail: hits.slice(0, 100) };
  }

  readModule(relativeFile: string, environment: OnecEnv): OnecResult {
    const blocked = this.gate(environment, false);
    if (blocked) return blocked;
    const full = relativeFile.endsWith(".bsl") ? safeExistingFile(this.root, relativeFile) : null;
    if (!full) {
      return { ok: false, code: "NOT_FOUND", environment, adapter: this.adapter, message: "Модуль не найден, является symlink или путь выходит из выгрузки." };
    }
    return { ok: true, code: "OK", environment, adapter: this.adapter, message: "Прочитано.", path: full, detail: fs.readFileSync(full, "utf8") };
  }

  writeModule(relativeFile: string, next: string, environment: OnecEnv): OnecResult {
    const blocked = this.gate(environment, true);
    if (blocked) return blocked;
    const report = checkBsl(next);
    if (!report.ok) {
      return { ok: false, code: "DENY", environment, adapter: this.adapter, message: report.hits.map((hit) => hit.message).join(" "), detail: report };
    }
    const full = relativeFile.endsWith(".bsl") ? safeWriteFile(this.root, relativeFile) : null;
    if (!full) {
      return deny(environment, this.adapter, "Писать можно только в безопасный .bsl внутри выгрузки; symlink и выход наружу запрещены.");
    }
    const existed = fs.existsSync(full);
    const before = existed ? fs.readFileSync(full, "utf8") : "";
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, next);

    const validation = validateOnecExport(
      this.root,
      full,
      next,
      this.env,
      this.validationRunner,
    );
    if (!validation.ok) {
      if (existed) fs.writeFileSync(full, before);
      else fs.rmSync(full, { force: true });
      return {
        ok: false,
        code: "FAIL",
        environment,
        adapter: this.adapter,
        message: `Validation ${validation.level} не прошла. Файл откатан; база не обновлялась.`,
        path: full,
        detail: validation,
      };
    }

    return {
      ok: true,
      code: "OK",
      environment,
      adapter: this.adapter,
      message: `Модуль записан в выгрузку. Validation: ${validation.level}. База не обновлялась.`,
      path: full,
      diff: diffText(before, next),
      detail: validation,
    };
  }

  query(text: string, environment: OnecEnv): OnecResult {
    if (environment === "production") return deny(environment, this.adapter, "Запрос в production не выполняется и не правится.");
    const report = analyzeQuery(text);
    return { ok: report.ok, code: report.ok ? "OK" : "FAIL", environment, adapter: this.adapter, message: report.notes.map((note) => note.message).join(" "), detail: report };
  }

  create(kind: OnecKind, name: string, environment: OnecEnv): OnecResult {
    const blocked = this.gate(environment, true);
    if (blocked) return blocked;
    if (!/^[A-Za-zА-Яа-я0-9_]+$/.test(name) || name.includes("..")) {
      return deny(environment, this.adapter, "Имя объекта не годится.");
    }
    const config = jail(this.root, "Configuration.xml");
    if (!config || !fs.existsSync(config)) {
      return { ok: false, code: "FAIL", environment, adapter: this.adapter, message: "В выгрузке нет Configuration.xml." };
    }
    const xml = fs.readFileSync(config, "utf8");
    if (!xml.includes("<ChildObjects>")) {
      return { ok: false, code: "FAIL", environment, adapter: this.adapter, message: "В Configuration.xml нет ChildObjects. Файл не кромсаю." };
    }
    const tag = childTag(kind);
    const objectName = name.startsWith("jrvs_") ? name : `jrvs_${name}`;
    if (xml.includes(`<${tag}>${objectName}</${tag}>`)) {
      return { ok: true, code: "OK", environment, adapter: this.adapter, message: "Объект уже есть в составе расширения." };
    }
    const file = writeSkeleton(this.root, kind, objectName);
    const next = xml.replace("</ChildObjects>", `\t\t<${tag}>${objectName}</${tag}>\n\t</ChildObjects>`);
    fs.writeFileSync(config, next);
    return {
      ok: true,
      code: "OK",
      environment,
      adapter: this.adapter,
      message: "Объект добавлен в выгрузку расширения. В информационную базу это не загружалось.",
      path: file,
      diff: diffText(xml, next),
    };
  }
}

function childTag(kind: OnecKind): string {
  if (kind === "module") return "CommonModule";
  if (kind === "report") return "Report";
  if (kind === "processor" || kind === "print") return "DataProcessor";
  if (kind === "template") return "CommonTemplate";
  return "DataProcessor";
}

function writeSkeleton(root: string, kind: OnecKind, name: string): string {
  const id = createHash("sha1").update(name).digest("hex").slice(0, 8);
  if (kind === "module") {
    const xmlPath = path.join(root, "CommonModules", `${name}.xml`);
    const bslPath = path.join(root, "CommonModules", name, "Ext", "Module.bsl");
    fs.mkdirSync(path.dirname(bslPath), { recursive: true });
    if (!fs.existsSync(xmlPath)) {
      fs.writeFileSync(xmlPath, `<?xml version="1.0" encoding="UTF-8"?>\n<MetaDataObject><CommonModule uuid="${id}-0000-4000-8000-000000000000"><Properties><Name>${name}</Name><Server>true</Server><ExternalConnection>false</ExternalConnection><Privileged>false</Privileged><ServerCall>false</ServerCall></Properties></CommonModule></MetaDataObject>\n`);
    }
    if (!fs.existsSync(bslPath)) fs.writeFileSync(bslPath, `Функция ${name}Сводка() Экспорт\n\tВозврат "test";\nКонецФункции\n`);
    return bslPath;
  }
  const folder = kind === "report" ? "Reports" : kind === "template" ? "CommonTemplates" : "DataProcessors";
  const xmlPath = path.join(root, folder, `${name}.xml`);
  fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
  if (!fs.existsSync(xmlPath)) {
    fs.writeFileSync(xmlPath, `<?xml version="1.0" encoding="UTF-8"?>\n<MetaDataObject><Properties><Name>${name}</Name><Comment>${kind}. Не загружать в production.</Comment></Properties></MetaDataObject>\n`);
  }
  return xmlPath;
}

export class MockOnecExecutor {
  readonly adapter = "mock" as const;
  find(): OnecResult {
    return { ok: false, code: "FAIL", environment: "test", adapter: "mock", message: "Mock не читает выгрузку. Для файлов нужен FileOnecExecutor." };
  }
}

export function assertProductionDenied(environment: OnecEnv): OnecResult | null {
  if (environment !== "production") return null;
  return deny(environment, "file", "Production закрыт.");
}
