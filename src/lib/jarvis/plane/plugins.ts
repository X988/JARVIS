import fs from "node:fs";
import path from "node:path";
import { admitRegisteredTool } from "./tool-registry.ts";

export type PluginPermission =
  | "read"
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
  permissions: string[];
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
  "read",
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


function scalar(value: string): string {
  const clean = value.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    return clean.slice(1, -1);
  }
  return clean;
}

function parseInlineList(value: string): string[] | null {
  const clean = value.trim();
  if (!clean.startsWith("[") || !clean.endsWith("]")) return null;
  const body = clean.slice(1, -1).trim();
  if (!body) return [];
  return body.split(",").map((item) => scalar(item)).filter(Boolean);
}

/**
 * Strict manifest-only YAML subset: top-level scalars plus string lists.
 * Anchors, tags, objects, multiline blocks and duplicate keys are rejected.
 */
export function parsePluginYaml(raw: string): unknown | null {
  if (/\t|^[ \t]*[&*!>|]/m.test(raw)) return null;
  const out: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const original of raw.split(/\r?\n/)) {
    const line = original.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const listItem = /^\s{2,}-\s+(.+)$/.exec(line);
    if (listItem) {
      if (!listKey || !Array.isArray(out[listKey])) return null;
      (out[listKey] as string[]).push(scalar(listItem[1]));
      continue;
    }
    if (/^\s/.test(line)) return null;
    const hit = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line);
    if (!hit) return null;
    const key = hit[1];
    if (key in out) return null;
    const rawValue = hit[2] ?? "";
    const inline = parseInlineList(rawValue);
    if (inline) {
      out[key] = inline;
      listKey = null;
    } else if (!rawValue.trim()) {
      out[key] = [];
      listKey = key;
    } else if (key === "risk" && /^\d+$/.test(rawValue.trim())) {
      out[key] = Number(rawValue.trim());
      listKey = null;
    } else {
      out[key] = scalar(rawValue);
      listKey = null;
    }
  }
  return out;
}

function parseManifestFile(file: string): unknown | null {
  const ext = path.extname(file).toLowerCase();
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    const raw = fs.readFileSync(file, "utf8");
    if (ext === ".json") return JSON.parse(raw);
    if (ext === ".yaml" || ext === ".yml") return parsePluginYaml(raw);
    return null;
  } catch {
    return null;
  }
}


export function loadPluginDir(dir: string): { accepted: PluginManifest[]; rejected: string[] } {
  if (!fs.existsSync(dir)) return { accepted: [], rejected: [] };
  const accepted: PluginManifest[] = [];
  const rejected: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!/\.(?:json|ya?ml)$/i.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      rejected.push(entry.name);
      continue;
    }
    const file = path.join(dir, entry.name);
    const parsed = parseManifestFile(file);
    if (!parsed) {
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
  const checked = validatePlugin(manifest);
  if (!checked.ok) return { code: "DENY", reason: `plugin manifest отклонён: ${checked.code}` };
  manifest = checked.manifest;
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


export function discoverPluginDirectories(root: string): {
  accepted: PluginManifest[];
  rejected: string[];
  directories: string[];
} {
  const base = path.resolve(root);
  const names = ["plugins", "skills", "runbooks"];
  const accepted: PluginManifest[] = [];
  const rejected: string[] = [];
  const directories: string[] = [];
  for (const name of names) {
    const dir = path.join(base, name);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    directories.push(name);
    const result = loadPluginDir(dir);
    accepted.push(...result.accepted);
    rejected.push(...result.rejected.map((file) => `${name}/${file}`));
  }
  const ids = new Set<string>();
  const unique: PluginManifest[] = [];
  for (const manifest of accepted) {
    if (ids.has(manifest.id)) {
      rejected.push(`duplicate:${manifest.id}`);
      continue;
    }
    ids.add(manifest.id);
    unique.push(manifest);
  }
  return { accepted: unique, rejected, directories };
}
