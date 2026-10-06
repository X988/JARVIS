export type Target = {
  id: string;
  displayName: string;
  type: "host" | "database" | "router" | "mail" | "vpn" | "repo" | "fleet";
  environment: "production" | "test" | "development";
  roles: string[];
  address: string;
  aliases: string[];
  enabled: boolean;
  allowedRunbooks: string[];
};

export const INVENTORY: Target[] = [
  { id: "fleet", displayName: "Площадка", type: "fleet", environment: "production", roles: ["read"], address: "inventory", aliases: ["площадка", "сервер", "серверы", "серверах"], enabled: true, allowedRunbooks: ["server.health", "disk.check"] },
  { id: "dc01", displayName: "Контроллер домена", type: "host", environment: "production", roles: ["ad"], address: "dc01", aliases: ["dc01", "контроллер", "домен"], enabled: true, allowedRunbooks: ["server.health"] },
  { id: "srv1c01", displayName: "Сервер 1С", type: "host", environment: "production", roles: ["1c"], address: "srv1c01", aliases: ["srv1c01", "1с", "1c"], enabled: true, allowedRunbooks: ["server.health", "onec.read", "onec.patch"] },
  { id: "sql01", displayName: "SQL", type: "host", environment: "production", roles: ["sql"], address: "sql01", aliases: ["sql01", "sql"], enabled: true, allowedRunbooks: ["server.health", "sql.health", "sql.backup"] },
  { id: "mail01", displayName: "Почта", type: "mail", environment: "production", roles: ["mail"], address: "mail01", aliases: ["mail01", "mailcow", "мейлкау", "почта", "почту"], enabled: true, allowedRunbooks: ["mailcow.health", "server.health"] },
  { id: "rb5009", displayName: "MikroTik", type: "router", environment: "production", roles: ["edge"], address: "rb5009", aliases: ["rb5009", "mikrotik", "микротик"], enabled: true, allowedRunbooks: ["mikrotik.status"] },
  { id: "utp", displayName: "База utp", type: "database", environment: "production", roles: ["app"], address: "sql01/utp", aliases: ["utp", "утп", "ютп"], enabled: true, allowedRunbooks: ["sql.health", "sql.backup", "database.drop"] },
  { id: "wg", displayName: "WireGuard", type: "vpn", environment: "production", roles: ["vpn"], address: "wg0", aliases: ["wireguard", "вайргард", "wg"], enabled: true, allowedRunbooks: ["wireguard.status"] },
  { id: "jarvis-dev", displayName: "Выгрузка расширения", type: "repo", environment: "development", roles: ["1c-dev"], address: "extensions/JarvisDev", aliases: ["расширение", "выгрузка"], enabled: true, allowedRunbooks: ["onec.read", "onec.patch", "onec.form"] },
];

const STOP = new Set(["main", "master", "confirm", "approval", "backup", "docker", "github", "http", "https", "bsl", "cf", "dry", "run"]);

export function targetById(id: string): Target | null {
  return INVENTORY.find((item) => item.id === id) ?? null;
}

export function matchTarget(text: string): Target | null {
  const folded = text.toLowerCase();
  const ranked = [...INVENTORY].flatMap((item) => item.aliases.map((alias) => ({ item, alias: alias.toLowerCase() })));
  ranked.sort((a, b) => b.alias.length - a.alias.length);
  for (const row of ranked) {
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${row.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}_])`, "iu");
    if (pattern.test(` ${folded} `)) return row.item;
  }
  return null;
}

export function unknownLatinToken(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) ?? [];
  const known = new Set<string>(STOP);
  for (const item of INVENTORY) {
    known.add(item.id.toLowerCase());
    for (const alias of item.aliases) known.add(alias.toLowerCase());
  }
  for (const token of tokens) {
    if (known.has(token) || token.startsWith("approval-")) continue;
    return token;
  }
  return null;
}
