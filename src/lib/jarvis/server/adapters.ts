import type { ExecCall, ExecResult } from "./pipeline.ts";
import { runbookById, type Runbook } from "./runbooks.ts";
import { INVENTORY, targetById } from "./inventory.ts";
import { FileOnecExecutor } from "../onec/executor.ts";
import { sqlDatabase, runSql } from "./sql.ts";
import { runPostgres } from "./postgres.ts";
import { runSshProbe, runWindowsProbe } from "./host-probes.ts";
import { runRouterOs } from "./routeros.ts";
import { runMailcow } from "./mailcow.ts";
import { runGithubCi } from "./github.ts";
import path from "node:path";
import { recordAdapterProbe } from "./probe-status.ts";

export type ExecutorKind = Runbook["executor"];

export interface Executor {
  readonly type: ExecutorKind | "server-probe";
  execute(call: ExecCall): ExecResult;
}

function missing(type: string, code: "NOT_CONFIGURED" | "CREDENTIAL_UNAVAILABLE" | "ADAPTER_DISABLED", detail: string): ExecResult {
  return { called: false, code, detail: `${type}: ${detail}` };
}

function configured(hostEnv: string, secretEnv: string, type: string, intent: string): ExecResult | null {
  if (!process.env[hostEnv]) {
    return missing(type, "NOT_CONFIGURED", `${hostEnv} не задан. ${intent} Успех не подменяется.`);
  }
  if (!process.env[secretEnv]) {
    return missing(type, "CREDENTIAL_UNAVAILABLE", `${secretEnv} не задан. Подключение не начато.`);
  }
  return null;
}

export class MockExecutor implements Executor {
  readonly type = "mock" as const;
  execute(call: ExecCall): ExecResult {
    if (call.mode === "real") return missing("mock", "ADAPTER_DISABLED", "В режиме real mock не считается выполнением.");
    return { called: true, code: "MOCK", detail: "mock, это не живой сервер" };
  }
}
export class PowerShellExecutor implements Executor { readonly type = "powershell" as const; execute(call: ExecCall): ExecResult { return runWindowsProbe(call); } }
export class SSHExecutor implements Executor { readonly type = "ssh" as const; execute(call: ExecCall): ExecResult { return runSshProbe(call); } }
export class SQLExecutor implements Executor {
  readonly type = "sql" as const;
  execute(call: ExecCall): ExecResult {
    const blocked = configured("JARVIS_SQL_HOST","JARVIS_SQL_USER","sql","База берётся только из inventory, каталог резервной копии только из JARVIS_SQL_BACKUP_DIR.");
    if (blocked) return blocked;
    const database = sqlDatabase(call.target);
    if (!database) return missing("sql","NOT_CONFIGURED","База не из inventory. Запрос не собирался.");
    if (!process.env.JARVIS_SQL_PASSWORD) return missing("sql","CREDENTIAL_UNAVAILABLE","JARVIS_SQL_PASSWORD не задан. Запрос не отправлялся.");
    if (call.runbook === "sql.backup" && !process.env.JARVIS_SQL_BACKUP_DIR) return missing("sql","NOT_CONFIGURED","JARVIS_SQL_BACKUP_DIR не задан. BACKUP не запускался.");
    const mode = {
      "sql.health": "health",
      "sql.backup": "backup",
      "sql.database.size": "database-size",
      "sql.sessions": "sessions",
      "sql.blocking": "blocking",
      "sql.backup.status": "backup-status",
    }[call.runbook] as import("./sql.ts").SqlMode | undefined;
    if (!mode) return missing("sql","NOT_CONFIGURED","Для этой цели нет фиксированного SQL-запроса.");
    return runSql(mode, database);
  }
}
export class PostgresExecutor implements Executor {
  readonly type = "postgres" as const;
  execute(call: ExecCall): ExecResult {
    const blocked = configured("JARVIS_POSTGRES_HOST", "JARVIS_POSTGRES_USER", "postgres", "База берётся только из inventory.");
    if (blocked) return blocked;
    if (!process.env.JARVIS_POSTGRES_PASSWORD) return missing("postgres", "CREDENTIAL_UNAVAILABLE", "JARVIS_POSTGRES_PASSWORD не задан.");
    const mode = {
      "postgres.health": "health",
      "postgres.sessions": "sessions",
      "postgres.locks": "locks",
      "postgres.size": "size",
      "postgres.status": "status",
    }[call.runbook] as import("./postgres.ts").PostgresMode | undefined;
    if (!mode) return missing("postgres", "NOT_CONFIGURED", "Для этой цели нет фиксированного PostgreSQL-запроса.");
    const database = call.target === "postgres01" ? (process.env.JARVIS_POSTGRES_DATABASE || "") : "";
    return runPostgres(mode, database);
  }
}
export class RouterOSExecutor implements Executor { readonly type = "routeros" as const; execute(call: ExecCall): ExecResult { return runRouterOs(call); } }
export class DockerExecutor implements Executor { readonly type = "docker" as const; execute(call: ExecCall): ExecResult { return runMailcow(call); } }
export class GithubExecutor implements Executor { readonly type = "github" as const; execute(call: ExecCall): ExecResult { return runGithubCi(call); } }
export class OnecFileAdapter implements Executor {
  readonly type = "onec-file" as const;
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  execute(call: ExecCall): ExecResult {
    if (call.runbook === "onec.exec" || call.runbook === "onec.load") {
      return missing("onec-file", "ADAPTER_DISABLED", "DENY_ALWAYS. Исполнитель не вызывается.");
    }
    const root = this.env.JARVIS_ONEC_DUMP;
    if (!root) {
      return missing("onec-file", "NOT_CONFIGURED", "JARVIS_ONEC_DUMP не задан. Выгрузка не читалась.");
    }
    if (call.runbook !== "onec.read" && call.runbook !== "onec.query") {
      return missing("onec-file", "ADAPTER_DISABLED", "Правка формы или модуля требует структурный patch и заявку, не свободный текст.");
    }

    const file = new FileOnecExecutor(root, { env: this.env });
    if (call.runbook === "onec.query") {
      const queryText = call.parameters?.queryText?.trim() || call.parameters?.query?.trim();
      if (!queryText) {
        return missing(
          "onec-file",
          "NOT_CONFIGURED",
          "onec.query требует server-derived queryText. Общий успех без текста запроса не подменяется.",
        );
      }
      const reviewed = file.query(queryText, "development");
      return reviewed.ok
        ? { called: true, code: "OK", detail: `onec query: ${reviewed.message || "static analysis passed"}` }
        : { called: true, code: "VERIFICATION_FAILED", detail: `onec query: ${reviewed.message || "static analysis failed"}` };
    }

    const terms = [
      call.parameters?.procedure,
      call.parameters?.symbol,
      call.parameters?.module,
      call.parameters?.source,
      call.parameters?.object,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim());

    if (!terms.length) {
      return missing(
        "onec-file",
        "NOT_CONFIGURED",
        "onec.read требует server-derived module/procedure/source. Поиск фиксированного jrvs не считается чтением запроса пользователя.",
      );
    }

    for (const term of terms) {
      const found = file.searchSource(term, "development");
      if (found.ok) {
        return { called: true, code: "OK", detail: `onec read: term=${term}; files=${found.message}` };
      }
      if (found.code === "FAIL" || found.code === "DENY") {
        return { called: true, code: "VERIFICATION_FAILED", detail: `onec read: ${found.message}` };
      }
    }
    return { called: true, code: "VERIFICATION_FAILED", detail: "onec read: запрошенный символ не найден в BSL выгрузке." };
  }
}

export function probeRoute(targetId: string): "powershell" | "ssh" | "fleet" | "unrouted" {
  const target = targetById(targetId);
  if (!target) return "unrouted";
  if (target.type === "fleet") return "fleet";
  if (target.platform === "windows" && target.executor === "winrm") return "powershell";
  if (target.platform === "linux" && target.executor === "ssh") return "ssh";
  return "unrouted";
}

export class ServerProbeExecutor implements Executor {
  readonly type = "server-probe" as const;
  execute(call: ExecCall): ExecResult {
    const route = probeRoute(call.target);
    if (route === "fleet") {
      const members = INVENTORY.filter(
        (target) =>
          target.enabled &&
          target.type !== "fleet" &&
          target.allowedRunbooks.includes(call.runbook) &&
          probeRoute(target.id) !== "unrouted",
      );
      if (!members.length) {
        return missing("server-probe", "NOT_CONFIGURED", "В inventory нет доступных fleet members.");
      }
      const rows = members.map((target) => {
        const memberCall = { ...call, target: target.id };
        const memberRoute = probeRoute(target.id);
        const result =
          memberRoute === "powershell"
            ? new PowerShellExecutor().execute(memberCall)
            : new SSHExecutor().execute(memberCall);
        return { id: target.id, code: result.code, called: result.called };
      });
      const healthy = rows.filter((row) => row.code === "OK").length;
      const called = rows.some((row) => row.called);
      const detail = rows.map((row) => `${row.id}=${row.code}`).join("; ");
      if (healthy === rows.length) {
        return { called, code: "OK", detail: `fleet: ${detail}` };
      }
      if (!called && healthy === 0) {
        const codes = new Set(rows.map((row) => row.code));
        const code =
          codes.has("CREDENTIAL_UNAVAILABLE")
            ? "CREDENTIAL_UNAVAILABLE"
            : codes.has("ADAPTER_DISABLED")
              ? "ADAPTER_DISABLED"
              : "NOT_CONFIGURED";
        return {
          called: false,
          code,
          detail: `fleet: healthy=0/${rows.length}; no connection attempted; ${detail}`,
        };
      }
      return {
        called,
        code: healthy > 0 ? "VERIFICATION_FAILED" : "CONNECT_FAILED",
        detail: `fleet: healthy=${healthy}/${rows.length}; ${detail}`,
      };
    }
    if (route === "unrouted") return missing("server-probe","NOT_CONFIGURED",`У ${call.target} нет пары platform/executor в inventory. Глобальный host маршрут не выбирает.`);
    return (route === "powershell" ? new PowerShellExecutor() : new SSHExecutor()).execute(call);
  }
}

export function executorFor(kind: ExecutorKind, call: ExecCall): Executor {
  if (call.runbook === "server.health" || call.runbook === "disk.check") return new ServerProbeExecutor();
  if (kind === "powershell") return new PowerShellExecutor();
  if (kind === "ssh") return new SSHExecutor();
  if (kind === "sql") return new SQLExecutor();
  if (kind === "postgres") return new PostgresExecutor();
  if (kind === "routeros") return new RouterOSExecutor();
  if (kind === "docker") return new DockerExecutor();
  if (kind === "github") return new GithubExecutor();
  if (kind === "onec-file") return new OnecFileAdapter();
  return new MockExecutor();
}

export function defaultRealExecute(call: ExecCall): ExecResult {
  if (call.mode !== "real") return { called: false, code: "DRY_RUN", detail: "не боевой режим" };
  const book = runbookById(call.runbook);
  if (!book) return { called: false, code: "RUNBOOK_NOT_FOUND", detail: "нет такого runbook" };
  if (book.policy === "DENY_ALWAYS") return { called: false, code: "POLICY_DENIED", detail: "запрет не исполняется" };
  const executor = executorFor(book.executor, call);
  const result = executor.execute(call);
  const adapter =
    call.runbook === "server.health" || call.runbook === "disk.check"
      ? probeRoute(call.target)
      : book.executor;
  if (adapter !== "fleet" && adapter !== "unrouted" && adapter !== "mock") {
    const dir = path.resolve(process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"));
    try {
      recordAdapterProbe(dir, adapter, result);
    } catch {
      // Probe-state persistence must never convert an executor failure into success.
    }
  }
  return result;
}

function has(env: NodeJS.ProcessEnv, name: string): boolean { return Boolean(env[name]?.trim()); }
function targetMapHas(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw=env[name]?.trim();
  if(!raw) return false;
  try { const body=JSON.parse(raw) as unknown; return Boolean(body && typeof body==="object" && !Array.isArray(body) && Object.keys(body).length); }
  catch { return false; }
}

export function adapterStatus(env: NodeJS.ProcessEnv = process.env): Record<string,string> {
  const windowsTarget = targetMapHas(env,"JARVIS_WINDOWS_TARGETS_JSON") || has(env,"JARVIS_WINDOWS_HOST");
  const sshTarget = targetMapHas(env,"JARVIS_SSH_TARGETS_JSON") || has(env,"JARVIS_SSH_HOST");
  return {
    mock: "available",
    powershell: !windowsTarget ? "NOT_CONFIGURED" : !has(env,"JARVIS_WINDOWS_USER") || !has(env,"JARVIS_WINDOWS_PASSWORD") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    ssh: !sshTarget ? "NOT_CONFIGURED" : !has(env,"JARVIS_SSH_USER") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    sql: !has(env,"JARVIS_SQL_HOST") ? "NOT_CONFIGURED" : !has(env,"JARVIS_SQL_USER") || !has(env,"JARVIS_SQL_PASSWORD") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    postgres: !has(env,"JARVIS_POSTGRES_HOST") ? "NOT_CONFIGURED" : !has(env,"JARVIS_POSTGRES_USER") || !has(env,"JARVIS_POSTGRES_PASSWORD") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    routeros: !has(env,"JARVIS_MIKROTIK_HOST") ? "NOT_CONFIGURED" : !has(env,"JARVIS_MIKROTIK_USER") || !has(env,"JARVIS_MIKROTIK_PASSWORD") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    docker: !has(env,"JARVIS_DOCKER_HOST") || !has(env,"JARVIS_MAILCOW_COMPOSE") ? "NOT_CONFIGURED" : !has(env,"JARVIS_DOCKER_USER") && !has(env,"JARVIS_SSH_USER") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    github: !has(env,"JARVIS_GITHUB_TOKEN") ? "CREDENTIAL_UNAVAILABLE" : "CONFIGURED_UNPROBED",
    "onec-file": !has(env,"JARVIS_ONEC_DUMP") ? "NOT_CONFIGURED" : "CONFIGURED_UNPROBED",
  };
}
