import type { ExecCall, ExecResult } from "./pipeline.ts";
import { runbookById, type Runbook } from "./runbooks.ts";
import { targetById } from "./inventory.ts";
import { FileOnecExecutor } from "../onec/executor.ts";
import { sqlDatabase, runSql } from "./sql.ts";
import { runSshProbe, runWindowsProbe } from "./host-probes.ts";
import { runRouterOs } from "./routeros.ts";

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
    if (call.mode === "real") {
      return missing("mock", "ADAPTER_DISABLED", "В режиме real mock не считается выполнением.");
    }
    return { called: true, code: "MOCK", detail: "mock, это не живой сервер" };
  }
}

export class PowerShellExecutor implements Executor {
  readonly type = "powershell" as const;
  execute(call: ExecCall): ExecResult {
    return runWindowsProbe(call);
  }
}

export class SSHExecutor implements Executor {
  readonly type = "ssh" as const;
  execute(call: ExecCall): ExecResult {
    return runSshProbe(call);
  }
}

export class SQLExecutor implements Executor {
  readonly type = "sql" as const;
  execute(call: ExecCall): ExecResult {
    const blocked = configured(
      "JARVIS_SQL_HOST",
      "JARVIS_SQL_USER",
      "sql",
      "База берётся только из inventory, каталог резервной копии только из JARVIS_SQL_BACKUP_DIR.",
    );
    if (blocked) return blocked;
    const database = sqlDatabase(call.target);
    if (!database) return missing("sql", "NOT_CONFIGURED", "База не из inventory. Запрос не собирался.");
    if (!process.env.JARVIS_SQL_PASSWORD) {
      return missing("sql", "CREDENTIAL_UNAVAILABLE", "JARVIS_SQL_PASSWORD не задан. Запрос не отправлялся.");
    }
    if (call.runbook === "sql.backup" && !process.env.JARVIS_SQL_BACKUP_DIR) {
      return missing("sql", "NOT_CONFIGURED", "JARVIS_SQL_BACKUP_DIR не задан. BACKUP не запускался.");
    }
    if (call.runbook !== "sql.health" && call.runbook !== "sql.backup") {
      return missing("sql", "NOT_CONFIGURED", "Для этой цели нет фиксированного SQL-запроса.");
    }
    return runSql(call.runbook === "sql.backup" ? "backup" : "health", database);
  }
}

export class RouterOSExecutor implements Executor {
  readonly type = "routeros" as const;
  execute(call: ExecCall): ExecResult {
    return runRouterOs(call);
  }
}

export class DockerExecutor implements Executor {
  readonly type = "docker" as const;
  execute(call: ExecCall): ExecResult {
    const blocked = configured(
      "JARVIS_DOCKER_HOST",
      "JARVIS_MAILCOW_COMPOSE",
      "docker",
      "Read-only Mailcow: состояние сервисов compose и очередь.",
    );
    if (blocked) return blocked;
    return missing("docker", "ADAPTER_DISABLED", `Docker-клиент не подключён. ${call.runbook} на ${call.target} не опрашивался.`);
  }
}

export class OnecFileAdapter implements Executor {
  readonly type = "onec-file" as const;
  execute(call: ExecCall): ExecResult {
    if (call.runbook === "onec.exec" || call.runbook === "onec.load") {
      return missing("onec-file", "ADAPTER_DISABLED", "DENY_ALWAYS. Исполнитель не вызывается.");
    }
    const root = process.env.JARVIS_ONEC_DUMP;
    if (!root) return missing("onec-file", "NOT_CONFIGURED", "JARVIS_ONEC_DUMP не задан. Выгрузка не читалась.");
    if (call.runbook !== "onec.read" && call.runbook !== "onec.query") {
      return missing("onec-file", "ADAPTER_DISABLED", "Правка формы или модуля требует структурный patch и заявку, не свободный текст.");
    }
    const file = new FileOnecExecutor(root);
    const found = file.find("jrvs", "development");
    if (!found.ok) return { called: true, code: "VERIFICATION_FAILED", detail: found.message };
    return { called: true, code: "OK", detail: `Прочитана выгрузка development: ${found.message}` };
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
      return missing("server-probe", "NOT_CONFIGURED", "Обход всех узлов не подключён. Сводный успех не рисуется.");
    }
    if (route === "unrouted") {
      return missing(
        "server-probe",
        "NOT_CONFIGURED",
        `У ${call.target} нет пары platform/executor в inventory. Глобальный host маршрут не выбирает.`,
      );
    }
    return (route === "powershell" ? new PowerShellExecutor() : new SSHExecutor()).execute(call);
  }
}

export function executorFor(kind: ExecutorKind, call: ExecCall): Executor {
  if (call.runbook === "server.health" || call.runbook === "disk.check") return new ServerProbeExecutor();
  if (kind === "powershell") return new PowerShellExecutor();
  if (kind === "ssh") return new SSHExecutor();
  if (kind === "sql") return new SQLExecutor();
  if (kind === "routeros") return new RouterOSExecutor();
  if (kind === "docker") return new DockerExecutor();
  if (kind === "onec-file") return new OnecFileAdapter();
  return new MockExecutor();
}

export function defaultRealExecute(call: ExecCall): ExecResult {
  if (call.mode !== "real") return { called: false, code: "DRY_RUN", detail: "не боевой режим" };
  const book = runbookById(call.runbook);
  if (!book) return { called: false, code: "RUNBOOK_NOT_FOUND", detail: "нет такого runbook" };
  if (book.policy === "DENY_ALWAYS") return { called: false, code: "POLICY_DENIED", detail: "запрет не исполняется" };
  return executorFor(book.executor, call).execute(call);
}

export function adapterStatus(): Record<string, string> {
  const rows: Array<[string, Executor, ExecCall]> = [
    ["powershell", new PowerShellExecutor(), { runbook: "server.health", target: "dc01", mode: "real" }],
    ["ssh", new SSHExecutor(), { runbook: "server.health", target: "mail01", mode: "real" }],
    ["sql", new SQLExecutor(), { runbook: "sql.health", target: "utp", mode: "real" }],
    ["routeros", new RouterOSExecutor(), { runbook: "mikrotik.status", target: "rb5009", mode: "real" }],
    ["docker", new DockerExecutor(), { runbook: "mailcow.health", target: "mail01", mode: "real" }],
    ["onec-file", new OnecFileAdapter(), { runbook: "onec.read", target: "jarvis-dev", mode: "real" }],
  ];
  const out: Record<string, string> = { mock: "available" };
  for (const [name, executor, call] of rows) out[name] = executor.execute(call).code;
  return out;
}
