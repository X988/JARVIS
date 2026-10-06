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
