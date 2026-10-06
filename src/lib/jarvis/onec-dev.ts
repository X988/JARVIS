export type OnecEnv = "development" | "test" | "production";

export type DevStep = {
  capability: string;
  title: string;
  deny: boolean;
  reason: string;
  risk: 0 | 1 | 2 | 3;
  mutation: boolean;
  confirmation: "none" | "single" | "double";
};

export type DevPlan = {
  environment: OnecEnv;
  steps: DevStep[];
};

export const ONEC_DEV = {
  id: "jarvis-1c-dev",
  scope: "development и test: расширение, ветка, diff, PR после заявки. Не production.",
  allow: [
    "читать metadata",
    "читать и изменять BSL-модули",
    "общие модули",
    "модули объекта, менеджера и формы",
    "управляемые формы",
    "печатные формы",
    "макеты",
    "запросы",
    "отчёты и обработки",
    "расширения",
    "реквизиты и команды",
    "статический анализ",
    "tests",
    "git branch и diff",
    "commit и PR после approval",
  ],
  deny: [
    "CF в production",
    "обновление конфигурации production DB",
    "произвольный код",
    "прямая правка SQL-таблиц 1С",
    "удаление metadata production",
    "обход расширений",
  ],
};

const ALLOWED: { re: RegExp; capability: string; title: string; risk: 0 | 1 | 2; mutation: boolean; confirmation: DevStep["confirmation"] }[] = [
  { re: /метадан|metadata/, capability: "metadata.read", title: "Чтение metadata", risk: 0, mutation: false, confirmation: "none" },
  { re: /статическ\S*\s+анализ|синтакс\S*\s+контрол/, capability: "bsl.analyze", title: "Статический анализ", risk: 0, mutation: false, confirmation: "none" },
  { re: /\bdiff\b|дифф/, capability: "git.diff", title: "Diff расширения", risk: 0, mutation: false, confirmation: "none" },
  { re: /прогон\S*\s+тест|запуст\S*\s+тест|тест\S*\s+расширен/, capability: "bsl.tests", title: "Тесты расширения", risk: 1, mutation: false, confirmation: "none" },
  { re: /созда\S*\s+ветк|нов\S*\s+ветк/, capability: "git.branch", title: "Ветка расширения", risk: 1, mutation: true, confirmation: "none" },
  { re: /общ\S*\s+модул/, capability: "module.common", title: "Общий модуль", risk: 2, mutation: true, confirmation: "single" },
  { re: /печатн\S*\s+форм/, capability: "form.print", title: "Печатная форма", risk: 2, mutation: true, confirmation: "single" },
  { re: /управляем\S*\s+форм|(созда|измен|прав)\S*.{0,24}форм/, capability: "form.managed", title: "Управляемая форма", risk: 2, mutation: true, confirmation: "single" },
  { re: /макет/, capability: "template.edit", title: "Макет", risk: 2, mutation: true, confirmation: "single" },
  { re: /(созда|добав)\S*.{0,16}(отчет|отчёт)/, capability: "report.create", title: "Отчёт", risk: 2, mutation: true, confirmation: "single" },
  { re: /(созда|добав)\S*.{0,16}обработ/, capability: "processor.create", title: "Обработка", risk: 2, mutation: true, confirmation: "single" },
  { re: /созда\S*\s+расширен/, capability: "extension.create", title: "Новое расширение", risk: 2, mutation: true, confirmation: "single" },
  { re: /реквизит/, capability: "attribute.edit", title: "Реквизит", risk: 2, mutation: true, confirmation: "single" },
  { re: /(добав|созда)\S*.{0,12}команд/, capability: "command.edit", title: "Команда формы", risk: 2, mutation: true, confirmation: "single" },
  { re: /(прав|измен|перепиш)\S*.{0,20}запрос|запрос.{0,20}(прав|измен)/, capability: "query.edit", title: "Текст запроса", risk: 2, mutation: true, confirmation: "single" },
  { re: /(прав|измен|созда)\S*.{0,24}(bsl|модул)/, capability: "bsl.edit", title: "Модуль BSL", risk: 2, mutation: true, confirmation: "single" },
  { re: /коммит|commit|pull request|(^|\s)pr(\s|$)/, capability: "git.pr", title: "Commit и PR", risk: 2, mutation: true, confirmation: "single" },
];

function environmentOf(text: string): OnecEnv {
  if (/рабоч|production|прод|(^|\s)бой(\s|$)/.test(text)) return "production";
  if (/тест/.test(text)) return "test";
  if (/\bdev\b|разработ/.test(text)) return "development";
  return "test";
}

function denyStep(text: string): DevStep | null {
  if (/произвольн\S*\s+код|выполнить\s*\(|динамическ\S*\s+выполн/.test(text)) {
    return step("code.execute", "Произвольный код", true, "Выполнить() и произвольный код не запускаются ни в одном контуре.", 3);
  }
  if (/sql\s*таблиц|таблиц\S*\s+sql|напрямую\s+в\s+sql/.test(text)) {
    return step("sql.direct", "Прямая правка SQL", true, "Таблицы 1С напрямую не меняются. Только метаданные расширения.", 3);
  }
  if (/удал\S*\s+метадан/.test(text)) {
    return step("metadata.delete", "Удаление metadata", true, "Удаление metadata, тем более в production, автоматическим быть не может.", 3);
  }
  if (/минуя\s+расширен|без\s+расширен|основн\S*\s+конфигурац/.test(text)) {
    return step("extension.bypass", "Обход расширений", true, "Правка идёт через расширение. Основную конфигурацию этот контур не обходит.", 3);
  }
  if (/(загруз\S*|залей).{0,24}\bcf\b.{0,24}(рабоч|production|прод)|(рабоч|production|прод).{0,24}\bcf\b/.test(text)) {
    return step("cf.load", "Загрузка CF", true, "CF в production не загружается.", 3);
  }
  if (/обнов\S*\s+конфигурац/.test(text) && /рабоч|production|прод/.test(text)) {
    return step("db.update", "Обновление конфигурации базы", true, "Конфигурацию production DB не обновляем.", 3);
  }
  return null;
}

function step(
  capability: string,
  title: string,
  deny: boolean,
  reason: string,
  risk: DevStep["risk"],
  mutation = deny,
  confirmation: DevStep["confirmation"] = "none",
): DevStep {
  return { capability, title, deny, reason, risk, mutation, confirmation };
}

function allowStep(text: string, environment: OnecEnv): DevStep | null {
  const found = ALLOWED.find((item) => item.re.test(text));
  if (!found) return null;
  if (environment === "production") {
    return step(
      found.capability,
      found.title,
      true,
      "Это действие разработчика разрешено только в development или test.",
      3,
    );
  }
  return step(found.capability, found.title, false, "", found.risk, found.mutation, found.confirmation);
}

function chunksOf(text: string): string[] {
  return text
    .split(/\s*(?:,|;| и | потом | затем )\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

export function classifyOnecDeveloper(raw: string): DevPlan | null {
  const text = raw.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const environment = environmentOf(text);
  const parts = chunksOf(text);
  const steps: DevStep[] = [];
  for (const part of parts) {
    const denied = denyStep(part) ?? (environment === "production" ? denyStep(`${part} production`) : null);
    const allowed = denied ?? allowStep(part, environment);
    if (!allowed) return null;
    steps.push(allowed);
    if (steps.length === 6) break;
  }
  if (steps.length === 0) return null;
  return { environment, steps };
}

export const onecDevAdapter = {
  mode: "mock" as const,
  note: "MockOnecRepository: правка остаётся в копии расширения. Кластер production не вызывается.",
};
