import type { ExecCall, ExecResult } from "./pipeline.ts";

const HOST: Record<string, string> = {
  ssh: "JARVIS_SSH_HOST",
  powershell: "JARVIS_WINDOWS_HOST",
  sql: "JARVIS_SQL_HOST",
  routeros: "JARVIS_MIKROTIK_HOST",
  docker: "JARVIS_DOCKER_HOST",
  "onec-file": "JARVIS_ONEC_DUMP",
};

export function defaultRealExecute(call: ExecCall): ExecResult {
  if (call.mode !== "real") return { called: false, code: "DRY_RUN", detail: "не боевой режим" };
  const key = HOST[call.runbook.includes("sql") ? "sql" : "ssh"];
  void key;
  return {
    called: false,
    code: "NOT_CONFIGURED",
    detail: "Живой адаптер не настроен. Успех не подменяется.",
  };
}

export function adapterStatus(): Record<string, string> {
  const names = ["powershell", "ssh", "sql", "routeros", "docker", "onec-file"] as const;
  const out: Record<string, string> = { mock: "available" };
  for (const name of names) {
    const env = HOST[name];
    out[name] = process.env[env] ? "CREDENTIAL_UNAVAILABLE" : "NOT_CONFIGURED";
  }
  return out;
}
