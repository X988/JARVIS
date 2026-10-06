import { matchIntent, normalize, type IntentId } from "@/lib/jarvis/model";

export type SpeechAlt = {
  transcript: string;
  confidence: number;
};

export type SpeechReading = {
  raw: string;
  text: string;
  changed: boolean;
  uncertain: boolean;
  choices: { label: string; text: string }[];
};

export type RawResult = {
  isFinal?: boolean;
  length?: number;
  [index: number]: { transcript?: string; confidence?: number } | undefined;
};

const REPAIRS: [RegExp, string][] = [
  [/^(жарвис|чарвис|зарвис|дарвис|гарвис|джарвис)[, ]+/, ""],
  [/мейл\s*кау|мейл\s*ков|мейл\s*коу|мэйл\s*ков|майл\s*ков|майлков|мелков|мылков|мылкоу|мейлкоу|мейлкау|mail\s*cow/g, "mailcow"],
  [/вайр\s*гард\S*|вайер\s*гард\S*|ваергард\S*|wire\s*guard/g, "wireguard"],
  [/майкро\s*тик|микро\s*тик/g, "mikrotik"],
  [/гит\s*хаб|git\s*hub/g, "github"],
  [/экшенс|экшнс|экшены/g, "actions"],
  [/ютэпэ|ю\s*т\s*п|у\s*т\s*п|утипи|ютип/g, "utp"],
  [/(^|\s)один эс(\s|$)/g, "$11с$2"],
  [/(^|\s)один с(\s|$)/g, "$11с$2"],
  [/проверь почт\S*/g, "проверь mailcow"],
  [/(^|\s)сервак\S*/g, "$1сервер"],
  [/проверь север/g, "проверь сервер"],
  [/чекни/g, "проверь"],
  [/бекап/g, "бэкап"],
  [/(^|\s)ди\s*си(\s|$)/g, "$1контроллер домена$2"],
  [/(^|\s)дц(\s|$)/g, "$1контроллер домена$2"],
];

const SAFE: { say: string; keys: string[] }[] = [
  { say: "Проверь Mailcow", keys: ["mailcow", "почт"] },
  { say: "Сделай резервную копию базы utp", keys: ["utp", "бэкап", "копи"] },
  { say: "Проверь базу utp", keys: ["базу utp", "базу"] },
  { say: "Проверь сервер", keys: ["сервер", "площад"] },
  { say: "Проверь сервер 1С", keys: ["1с"] },
  { say: "Проверь свободное место на всех серверах", keys: ["место", "диск"] },
  { say: "Посмотри WireGuard", keys: ["wireguard"] },
  { say: "Проверь MikroTik", keys: ["mikrotik", "маршрутизатор"] },
  { say: "Почему не работает резервный интернет", keys: ["интернет", "канал"] },
  { say: "Почему пользователи не заходят в 1С", keys: ["не заходят", "не пускает"] },
  { say: "Почему GitHub Actions упал", keys: ["github", "actions"] },
  { say: "Проверь Docker", keys: ["docker", "докер"] },
  { say: "Сделай отчёт за сегодня", keys: ["отчет", "сводк"] },
  { say: "Почисти сервер", keys: ["почисти", "очисти"] },
  { say: "Проверь контроллер домена", keys: ["контроллер"] },
];

export function repairSpeech(raw: string): string {
  let text = normalize(raw);
  for (const [pattern, next] of REPAIRS) text = text.replace(pattern, next);
  return text.replace(/\s+/g, " ").trim();
}

export function alternativesFrom(results: ArrayLike<RawResult>): SpeechAlt[] {
  const chunks: RawResult[] = [];
  for (let i = 0; i < results.length; i += 1) chunks.push(results[i]);
  if (!chunks.length) return [];
  const finals = chunks.filter((item) => item.isFinal);
  const tail = chunks[chunks.length - 1];
  const head = tail && !tail.isFinal ? finals : finals.slice(0, -1);
  const headText = head
    .map((item) => item[0]?.transcript ?? "")
    .join(" ")
    .trim();
  const varied = tail && !tail.isFinal ? tail : finals[finals.length - 1];
  const count = varied?.length ?? 1;
  const alts: SpeechAlt[] = [];
  for (let index = 0; index < count; index += 1) {
    const piece = varied?.[index]?.transcript?.trim() ?? "";
    const transcript = `${headText} ${piece}`.trim();
    if (!transcript) continue;
    alts.push({ transcript, confidence: varied?.[index]?.confidence ?? 0 });
  }
  if (!alts.length && headText) alts.push({ transcript: headText, confidence: 1 });
  return alts;
}

function grams(input: string): Map<string, number> {
  const map = new Map<string, number>();
  const text = ` ${input} `;
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

function dice(leftText: string, rightText: string): number {
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  const left = grams(leftText);
  const right = grams(rightText);
  let overlap = 0;
  let leftCount = 0;
  let rightCount = 0;
  for (const value of left.values()) leftCount += value;
  for (const value of right.values()) rightCount += value;
  for (const [gram, value] of left) overlap += Math.min(value, right.get(gram) ?? 0);
  return (2 * overlap) / (leftCount + rightCount);
}

function fuzzyScore(heard: string, item: { say: string; keys: string[] }): number {
  const say = normalize(item.say);
  const keyHit = item.keys.some((key) => heard.includes(normalize(key)));
  const similarity = dice(heard, say);
  if (!keyHit) return similarity < 0.86 ? similarity * 0.45 : similarity;
  return Math.max(similarity, 0.7);
}

export function interpretSpeech(alts: SpeechAlt[]): SpeechReading {
  const cleaned = alts
    .map((alt) => ({
      raw: alt.transcript.trim(),
      text: repairSpeech(alt.transcript),
      confidence: alt.confidence,
    }))
    .filter((alt) => alt.raw || alt.text);
  if (!cleaned.length) return { raw: "", text: "", changed: false, uncertain: false, choices: [] };

  const ranked = cleaned
    .map((alt) => ({ ...alt, intent: matchIntent(alt.text) as IntentId }))
    .sort((a, b) => {
      const known = Number(b.intent !== "unknown") - Number(a.intent !== "unknown");
      if (known !== 0) return known;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.text.length - a.text.length;
    });
  const best = ranked[0];
  if (best.intent !== "unknown") {
    const canon = SAFE.filter((item) => matchIntent(item.say) === best.intent);
    const text = canon.length === 1 ? canon[0].say : best.text;
    return {
      raw: best.raw,
      text,
      changed: normalize(best.raw) !== normalize(text),
      uncertain: false,
      choices: [],
    };
  }

  const basis = cleaned.slice().sort((a, b) => b.text.length - a.text.length)[0];
  const scored = SAFE.map((item) => ({ ...item, score: fuzzyScore(basis.text, item) })).sort(
    (a, b) => b.score - a.score,
  );
  const top = scored[0];
  const second = scored[1];
  const lead = top.score - (second?.score ?? 0);
  if (top.score >= 0.72 && lead >= 0.08) {
    return { raw: basis.raw, text: top.say, changed: true, uncertain: false, choices: [] };
  }
  if (top.score >= 0.62 && second && second.score >= 0.55 && lead < 0.08) {
    return {
      raw: basis.raw,
      text: basis.text,
      changed: false,
      uncertain: true,
      choices: [
        { label: top.say, text: top.say },
        { label: second.say, text: second.say },
      ],
    };
  }
  return {
    raw: basis.raw,
    text: basis.text || basis.raw,
    changed: normalize(basis.raw) !== (basis.text || basis.raw),
    uncertain: false,
    choices: [],
  };
}
