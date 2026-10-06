import fs from "node:fs";
import path from "node:path";
import type { InventoryTarget } from "./types.ts";

type InventoryFile = { version: number; targets: InventoryTarget[] };

function normalizeToken(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
}

function hasAlias(text: string, alias: string): boolean {
  const source = normalizeToken(text);
  const needle = normalizeToken(alias);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^\\p{L}\\p{N}_])" + escaped + "([^\\p{L}\\p{N}_]|$)", "iu").test(source);
}

export class InventoryService {
  private readonly targets: InventoryTarget[];

  constructor(targets: InventoryTarget[]) {
    this.targets = targets.filter((item) => item.enabled);
  }

  static fromFile(file = path.join(process.cwd(), "config", "jarvis", "inventory.json")): InventoryService {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as InventoryFile;
    if (!Array.isArray(parsed.targets)) throw new Error("Inventory targets missing");
    return new InventoryService(parsed.targets);
  }

  list(): InventoryTarget[] {
    return this.targets.map((item) => ({ ...item, aliases: [...item.aliases], roles: [...item.roles], allowedRunbooks: [...item.allowedRunbooks] }));
  }

  byId(id: string): InventoryTarget | null {
    return this.targets.find((item) => item.id === id) ?? null;
  }

  resolve(text: string): InventoryTarget[] {
    return this.targets.filter((target) => [target.id, target.displayName, ...target.aliases].some((alias) => hasAlias(text, alias)));
  }

  resolveOne(text: string, runbookId?: string): InventoryTarget | null {
    const hits = this.resolve(text).filter((item) => !runbookId || item.allowedRunbooks.includes(runbookId));
    return hits.length === 1 ? hits[0] : null;
  }
}

export function correctInfrastructureAlias(text: string, inventory: InventoryService): { text: string; target: InventoryTarget | null } {
  const hits = inventory.resolve(text);
  if (hits.length !== 1) return { text, target: null };
  return { text, target: hits[0] };
}
