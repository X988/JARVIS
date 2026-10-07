import fs from "node:fs";
import path from "node:path";

export type Target = {
  id: string;
  displayName: string;
  type: "host" | "database" | "router" | "mail" | "vpn" | "repo" | "fleet";
  environment: "production" | "test" | "development";
  roles: string[];
  reference: string;
  aliases: string[];
  enabled: boolean;
  allowedRunbooks: string[];
  platform?: "windows" | "linux" | "routeros";
  executor?: "winrm" | "ssh" | "routeros";
  voiceCanonical?: string;
};

type InventoryFile = { version: number; targets: Target[] };

const WORDS_THAT_ARE_NOT_HOSTS = new Set([
  "main",
  "master",
  "confirm",
  "approval",
  "backup",
  "docker",
  "github",
  "http",
  "https",
  "bsl",
  "cf",
  "dry",
  "run",
  "check",
  "server",
  "health",
  "status",
]);

const TARGET_TYPES = new Set<Target["type"]>(["host", "database", "router", "mail", "vpn", "repo", "fleet"]);
const ENVIRONMENTS = new Set<Target["environment"]>(["production", "test", "development"]);
const PLATFORMS = new Set<NonNullable<Target["platform"]>>(["windows", "linux", "routeros"]);
const EXECUTORS = new Set<NonNullable<Target["executor"]>>(["winrm", "ssh", "routeros"]);

function boundedStrings(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= maxLength)
  );
}

function validTarget(value: unknown): value is Target {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Partial<Target>;
  if (
    typeof target.id !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(target.id) ||
    typeof target.displayName !== "string" ||
    !target.displayName.trim() ||
    target.displayName.length > 200 ||
    typeof target.type !== "string" ||
    !TARGET_TYPES.has(target.type as Target["type"]) ||
    typeof target.environment !== "string" ||
    !ENVIRONMENTS.has(target.environment as Target["environment"]) ||
    !boundedStrings(target.roles, 64, 128) ||
    typeof target.reference !== "string" ||
    !target.reference.trim() ||
    target.reference.length > 300 ||
    !boundedStrings(target.aliases, 128, 200) ||
    typeof target.enabled !== "boolean" ||
    !boundedStrings(target.allowedRunbooks, 128, 128)
  ) return false;

  if (target.voiceCanonical !== undefined && (typeof target.voiceCanonical !== "string" || target.voiceCanonical.length > 100)) {
    return false;
  }
  if (target.platform !== undefined && !PLATFORMS.has(target.platform)) return false;
  if (target.executor !== undefined && !EXECUTORS.has(target.executor)) return false;
  if ((target.platform === undefined) !== (target.executor === undefined)) return false;
  if (target.platform === "windows" && target.executor !== "winrm") return false;
  if (target.platform === "linux" && target.executor !== "ssh") return false;
  if (target.platform === "routeros" && target.executor !== "routeros") return false;
  return true;
}

function loadInventory(file = path.join(process.cwd(), "config", "jarvis", "inventory.json")): Target[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new Error("Invalid JARVIS inventory JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JARVIS inventory");
  const doc = parsed as Partial<InventoryFile>;
  const version = doc.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || !Array.isArray(doc.targets)) {
    throw new Error("Invalid JARVIS inventory");
  }

  const seen = new Set<string>();
  const targets: Target[] = [];
  for (const raw of doc.targets) {
    if (!validTarget(raw)) throw new Error("Invalid JARVIS inventory target");
    if (seen.has(raw.id)) throw new Error("Duplicate JARVIS inventory target: " + raw.id);
    seen.add(raw.id);
    targets.push({
      ...raw,
      roles: [...raw.roles],
      aliases: [...raw.aliases],
      allowedRunbooks: [...raw.allowedRunbooks],
    });
  }
  return targets.filter((target) => target.enabled);
}

export const INVENTORY: Target[] = loadInventory();

function fold(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasAsWholeWord(alias: string): RegExp {
  const body = escapeRegex(alias);
  return new RegExp("(?:^|[^\\p{L}\\p{N}_])" + body + "(?:$|[^\\p{L}\\p{N}_])", "iu");
}

export function targetById(id: string): Target | null {
  return INVENTORY.find((item) => item.id === id) ?? null;
}

export function matchTarget(text: string): Target | null {
  const folded = fold(text);
  const aliases = INVENTORY.flatMap((item) =>
    [item.id, item.displayName, ...item.aliases].map((alias) => ({ item, alias: fold(alias) })),
  );
  aliases.sort((left, right) => right.alias.length - left.alias.length);
  for (const row of aliases) {
    if (aliasAsWholeWord(row.alias).test(" " + folded + " ")) return row.item;
  }
  return null;
}

export function unknownLatinToken(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) ?? [];
  const known = new Set<string>(WORDS_THAT_ARE_NOT_HOSTS);
  for (const item of INVENTORY) {
    known.add(item.id.toLowerCase());
    for (const alias of item.aliases) {
      for (const token of alias.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) ?? []) known.add(token);
    }
  }
  for (const token of tokens) {
    if (known.has(token) || token.startsWith("approval-")) continue;
    return token;
  }
  return null;
}
