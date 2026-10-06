export function admitMcp(name: string, known: string[]): { code: "DENY" | "GATEWAY"; name: string } {
  if (!known.includes(name)) return { code: "DENY", name };
  return { code: "GATEWAY", name };
}
