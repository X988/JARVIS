import fs from "node:fs";
import path from "node:path";
import { admitRegisteredTool } from "./tool-registry.ts";

export type PluginPermission =
  | "inventory:read"
  | "memory:read"
  | "artifact:write"
  | "network:read"
  | "repository:read";

export type PluginManifest = {
  id: string;
  version: string;
  description: string;
  inputs: string[];
  outputs: string[];
  risk: 0 | 1 | 2 | 3;
  permissions: PluginPermission[];
  supported_targets: string[];
  runbook: string;
};

export type PluginValidation =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; code: "UNKNOWN_PLUGIN" | "SHELL_DENIED" | "PERMISSION_DENIED" };

const SHELL = /shell|bash|powershell|cmd\.exe|sudo|invoke-expression/i;
const DANGEROUS_PERMISSION =
  /secret|credential|admin|root|production[:_-]?write|process[:_-]?exec|filesystem[:_-]?raw|network[:_-]?write/i;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const RUNBOOK = /^[a-z][a-z0-9.-]{1,95}$/;
const FIELD = /^[A-Za-z0-9_.:-]{1,96}$/;
const PERMISSIONS = new Set<PluginPermission>([
  "inventory:read",
  "memory:read",
  "artifact:write",
  "network:read",
  "repository:read",
]);

function stringArray(value: unknown, maxItems = 64): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && FIELD.test(item))
  );
}

function permissionArray(value: unknown): value is PluginPermission[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        !SHELL.test(item) &&
        !DANGEROUS_PERMISSION.test(item) &&
        PERMISSIONS.has(item as PluginPermission),
    )
  );
}

export function validatePlugin(raw: unknown): PluginValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "UNKNOWN_PLUGIN" };
  }
  const item = raw as Record<string, unknown>;
  const risk = item.risk;
  if (
    typeof item.id !== "string" ||
    !ID.test(item.id) ||
    typeof item.version !== "string" ||
    !VERSION.test(item.version) ||
    typeof item.description !== "string" ||
    item.description.trim().length < 1 ||
    item.description.length > 500 ||
    typeof item.runbook !== "string" ||
    !RUNBOOK.test(item.runbook) ||
    !stringArray(item.inputs) ||
    !stringArray(item.outputs) ||
    !stringArray(item.supported_targets) ||
    !Number.isInteger(risk) ||
    (risk as number) < 0 ||
    (risk as number) > 3 ||
    !Array.isArray(item.permissions)
  ) {
    return { ok: false, code: "UNKNOWN_PLUGIN" };
  }
  if (
    SHELL.test(item.runbook) ||
    item.permissions.some((permission) => typeof permission === "string" && SHELL.test(permission))
  ) {
    return { ok: false, code: "SHELL_DENIED" };
  }
  if (!permissionArray(item.permissions)) {
    return { ok: false, code: "PERMISSION_DENIED" };
  }

  return {
    ok: true,
    manifest: {
      id: item.id,
      version: item.version,
      description: item.description.trim(),
      inputs: [...item.inputs],
      outputs: [...item.outputs],
      risk: risk as 0 | 1 | 2 | 3,
      permissions: [...item.permissions],
      supported_targets: [...item.supported_targets],
      runbook: item.runbook,
    },
  };
}

export function loadPluginDir(dir: string): { accepted: PluginManifest[]; rejected: string[] } {
  if (!fs.existsSync(dir)) return { accepted: [], rejected: [] };
  const accepted: PluginManifest[] = [];
  const rejected: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.endsWith(".json")) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      rejected.push(entry.name);
      continue;
    }
    const file = path.join(dir, entry.name);
    let parsed: unknown;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 256 * 1024) {
        rejected.push(entry.name);
        continue;
      }
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      rejected.push(entry.name);
      continue;
    }
    const result = validatePlugin(parsed);
    if (result.ok) accepted.push(result.manifest);
    else rejected.push(entry.name);
  }
  return { accepted, rejected };
}

export function admitPlugin(
  manifest: PluginManifest,
  target: string,
): { code: "DENY" | "GATEWAY"; reason?: string } {
  if (!manifest.supported_targets.includes(target)) {
    return { code: "DENY", reason: "plugin manifest не разрешает target" };
  }
  const admission = admitRegisteredTool(manifest.runbook, target);
  if (admission.code === "DENY") return { code: "DENY", reason: admission.reason };
  if (manifest.risk !== admission.tool.risk) {
    return { code: "DENY", reason: "risk в plugin manifest не совпадает с Runbook Registry" };
  }
  return { code: "GATEWAY" };
}
