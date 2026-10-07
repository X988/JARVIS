import fs from "node:fs";
import path from "node:path";
import { admitRegisteredTool } from "./tool-registry.ts";

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

const SHELL = /shell|bash|powershell|cmd\.exe/i;

export function validatePlugin(raw: unknown): { ok: true; manifest: PluginManifest } | { ok: false; code: "UNKNOWN_PLUGIN" | "SHELL_DENIED" } {
  if (!raw || typeof raw !== "object") return { ok: false, code: "UNKNOWN_PLUGIN" };
  const item = raw as Partial<PluginManifest>;
  if (!item.id || !item.version || !item.runbook || !Array.isArray(item.inputs) || typeof item.risk !== "number") {
    return { ok: false, code: "UNKNOWN_PLUGIN" };
  }
  if ((item.permissions ?? []).some((permission) => SHELL.test(permission)) || SHELL.test(item.runbook)) {
    return { ok: false, code: "SHELL_DENIED" };
  }
  return { ok: true, manifest: item as PluginManifest };
}

export function loadPluginDir(dir: string): { accepted: PluginManifest[]; rejected: string[] } {
  if (!fs.existsSync(dir)) return { accepted: [], rejected: [] };
  const accepted: PluginManifest[] = [];
  const rejected: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      rejected.push(name);
      continue;
    }
    const result = validatePlugin(parsed);
    if (result.ok) accepted.push(result.manifest);
    else rejected.push(name);
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
