const BLOCKED = /login|signin|oauth|2fa|payment|checkout|admin\/change/i;

export function browserIntent(action: string): { code: "READ" | "DENY" } {
  if (BLOCKED.test(action) || action === "change" || action === "pay") return { code: "DENY" };
  if (action === "read") return { code: "READ" };
  return { code: "DENY" };
}
