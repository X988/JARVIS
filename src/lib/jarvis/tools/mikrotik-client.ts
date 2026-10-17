import https from "node:https";
import type { MikrotikConfig } from "./types.ts";

export type MikrotikCall = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: Record<string, unknown>;
};

export type MikrotikResult = {
  status: number;
  body: string;
};

export type MikrotikClient = {
  request(call: MikrotikCall): Promise<MikrotikResult>;
};

const READ_PATHS = new Set([
  "/rest/interface",
  "/rest/ip/firewall/filter",
  "/rest/ip/dhcp-server/lease",
  "/rest/log",
  "/rest/system/resource",
]);

export function assertMikrotikCall(call: MikrotikCall): void {
  if (!call.path.startsWith("/rest/") || call.path.includes("..") || call.path.includes("?") || call.path.includes("\\")) {
    throw new Error("mikrotik path rejected");
  }
  if (call.method === "GET" && READ_PATHS.has(call.path) && call.body === undefined) return;
  if (call.method === "POST" && call.path === "/rest/system/backup/save") {
    const name = call.body?.name;
    if (typeof name !== "string" || !/^jarvis-\d{8}T\d{6}Z$/.test(name)) {
      throw new Error("mikrotik backup name rejected");
    }
    if (Object.keys(call.body ?? {}).some((key) => key !== "name")) throw new Error("mikrotik body rejected");
    return;
  }
  if (call.method === "PATCH" && /^\/rest\/interface\/[A-Za-z0-9_-]{1,32}$/.test(call.path)) {
    if (typeof call.body?.disabled !== "boolean") throw new Error("mikrotik body rejected");
    if (Object.keys(call.body).some((key) => key !== "disabled")) throw new Error("mikrotik body rejected");
    return;
  }
  throw new Error("mikrotik path rejected");
}

export function createMikrotikClient(config: MikrotikConfig): MikrotikClient {
  return {
    request(call) {
      assertMikrotikCall(call);
      if (!config.configured || !config.password) {
        return Promise.reject(new Error("MikroTik credentials are not configured"));
      }
      const payload = call.body ? JSON.stringify(call.body) : null;
      const authorization = `Basic ${Buffer.from(`${config.user}:${config.password}`, "utf8").toString("base64")}`;
      const rejectUnauthorized = config.tlsInsecure !== true;
      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            host: config.host,
            port: config.port,
            path: call.path,
            method: call.method,
            rejectUnauthorized,
            timeout: 10000,
            headers: {
              accept: "application/json",
              authorization,
              ...(payload
                ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
                : {}),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });
            res.on("end", () => {
              resolve({
                status: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8").slice(0, 8000),
              });
            });
          },
        );
        req.on("timeout", () => {
          req.destroy(new Error("MikroTik request timed out"));
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
      });
    },
  };
}
