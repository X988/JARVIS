import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SshHost } from "./types.ts";

export type SshRequest = {
  host: SshHost;
  command: string;
  knownHostsPath: string;
};

export type ExecResult = {
  exitCode: number;
  output: string;
};

export function buildSshArgs(request: SshRequest): string[] {
  const identity = request.host.identityFile;
  if (!identity) throw new Error("SSH identity file is not configured");
  if (!request.host.configured) throw new Error("SSH host is not configured");
  return [
    "-i",
    identity,
    "-p",
    String(request.host.port),
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${request.knownHostsPath}`,
    "-o",
    "ConnectTimeout=8",
    `${request.host.user}@${request.host.host}`,
    request.command,
  ];
}

export type CommandExecutor = (request: SshRequest) => Promise<ExecResult>;

export function createSshExecutor(): CommandExecutor {
  return async (request) => {
    const args = buildSshArgs(request);
    await mkdir(dirname(request.knownHostsPath), { recursive: true });
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 15000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length < 12000) stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        if (stderr.length < 4000) stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const output = [`exit ${code ?? 1}`, stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        resolve({ exitCode: code ?? 1, output: output.slice(0, 8000) });
      });
    });
  };
}
