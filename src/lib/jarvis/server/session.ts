export type Session = {
  id: string;
  accountId: string;
  role: "operator" | "none";
  expiresAt: number;
  channel?: "web" | "telegram" | "test";
};

export function testSession(accountId: "admin1" | "stranger", now=Date.now()): Session {
  return {
    id:"test-"+accountId,
    accountId,
    role:accountId==="admin1" ? "operator" : "none",
    expiresAt:now+60*60_000,
    channel:"test",
  };
}
