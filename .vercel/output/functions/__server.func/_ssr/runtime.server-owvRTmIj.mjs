import { t as heuristicPlan } from "./heuristic-xzVbapw2.mjs";
import { i as resolveActor, n as canApprove, r as parseOperators, t as DEMO_ACTORS } from "./actors-DFw_72c8.mjs";
import nodeHTTPS from "node:https";
import { dirname } from "node:path";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
//#region node_modules/.nitro/vite/services/ssr/assets/runtime.server-owvRTmIj.js
/** Tokens that never run, even if someone adds them to an allowlist. */
var SSH_DENY_TOKENS = [
	"rm",
	"mkfs",
	"dd",
	"shutdown",
	"reboot",
	"poweroff",
	"halt",
	"passwd",
	"useradd",
	"userdel",
	"usermod",
	"visudo",
	"chmod",
	"chown",
	"chgrp",
	"iptables",
	"nft",
	"curl",
	"wget",
	"nc",
	"ncat",
	"netcat",
	"bash",
	"sh",
	"zsh",
	"eval",
	"sudo",
	"su",
	"fdisk",
	"parted",
	"wipefs",
	"mkfifo",
	"kill",
	"pkill",
	"python",
	"python3",
	"perl",
	"ruby",
	"node",
	"npm"
];
var DEFAULT_SSH_ALLOW_READ = [
	"uptime",
	"hostname",
	"who",
	"w",
	"df -h",
	"df -hP",
	"free -m",
	"uname -a",
	"cat /etc/os-release",
	"docker ps",
	"docker compose ps",
	"ip addr",
	"ip route",
	"ss -lnt",
	"systemctl status *",
	"systemctl is-active *"
];
var DEFAULT_SSH_ALLOW_CHANGE = [
	"systemctl restart nginx",
	"systemctl restart postfix",
	"systemctl restart dovecot"
];
var META = /[;&|`$<>\\\n\r\t(){}[\]!#*?~"'"]/;
function commandTokens(command) {
	const trimmed = command.trim();
	if (!trimmed || trimmed.length > 180) return null;
	if (META.test(trimmed)) return null;
	if (/\s{2,}/.test(trimmed)) return null;
	const tokens = trimmed.split(" ");
	if (tokens.some((token) => token.length === 0)) return null;
	return tokens;
}
function matchAllow(pattern, command) {
	const cmdTokens = commandTokens(command);
	const patTokens = pattern.trim().split(" ");
	if (!cmdTokens || patTokens.length !== cmdTokens.length) return false;
	return patTokens.every((pat, index) => {
		if (pat === "*") return /^[A-Za-z0-9@._:+-]{1,64}$/.test(cmdTokens[index] ?? "");
		return pat === cmdTokens[index];
	});
}
function assessSshCommand(command, risk, allowRead, allowChange, extraDeny) {
	const tokens = commandTokens(command);
	if (!tokens) return {
		ok: false,
		reason: "command rejected: empty, too long, or contains shell metacharacters"
	};
	const denied = new Set([...SSH_DENY_TOKENS, ...extraDeny.map((item) => item.trim().toLowerCase())].filter(Boolean));
	if (tokens.some((token) => denied.has(token.toLowerCase()))) return {
		ok: false,
		reason: "command rejected by denylist"
	};
	const lower = tokens.join(" ").toLowerCase();
	for (const pattern of extraDeny) {
		const normalized = pattern.trim().toLowerCase();
		if (normalized.includes(" ") && lower.includes(normalized)) return {
			ok: false,
			reason: "command rejected by denylist"
		};
	}
	if (!(risk === "change" ? allowChange : allowRead).some((pattern) => matchAllow(pattern, command.trim()))) return {
		ok: false,
		reason: risk === "change" ? "command is not on the change allowlist" : "command is not on the read allowlist"
	};
	return { ok: true };
}
function safeHost(value) {
	if (!value) return null;
	const trimmed = value.trim();
	if (!/^[A-Za-z0-9._:-]{1,253}$/.test(trimmed)) return null;
	if (trimmed.startsWith("-")) return null;
	return trimmed;
}
function safeUser(value) {
	if (!value) return null;
	const trimmed = value.trim();
	if (!/^[A-Za-z0-9._-]{1,64}$/.test(trimmed)) return null;
	return trimmed;
}
function safeIdentityFile(value) {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed.startsWith("/")) return null;
	if (trimmed.includes("..") || /[\n\r\0]/.test(trimmed)) return null;
	return trimmed;
}
function safePort(value, fallback) {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
	return n;
}
function safeInterfaceName(value) {
	return /^[A-Za-z0-9_-]{1,32}$/.test(value) && !value.includes("..");
}
function executionModeFromEnv(value) {
	return value?.trim().toLowerCase() === "live" ? "live" : "dry-run";
}
function splitList(value) {
	if (!value?.trim()) return null;
	const items = value.split(";;").map((item) => item.trim()).filter(Boolean);
	return items.length > 0 ? items : null;
}
function envKey(alias) {
	return alias.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}
function defaultHosts() {
	return [{
		alias: "mail01",
		host: "mail01",
		user: "jarvis",
		port: 22,
		identityFile: null,
		configured: false
	}];
}
function hostFromEnv(env, alias) {
	const key = envKey(alias);
	const host = safeHost(env[`JARVIS_SSH_${key}_HOST`]);
	const user = safeUser(env[`JARVIS_SSH_${key}_USER`]);
	if (!host || !user) return null;
	const identityFile = safeIdentityFile(env[`JARVIS_SSH_${key}_KEY`]);
	return {
		alias,
		host,
		user,
		port: safePort(env[`JARVIS_SSH_${key}_PORT`], 22),
		identityFile,
		configured: Boolean(identityFile)
	};
}
function asRecord(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value;
}
function parseSecrets(text) {
	if (!text?.trim()) return null;
	try {
		const parsed = asRecord(JSON.parse(text));
		if (!parsed) return null;
		return parsed;
	} catch {
		return null;
	}
}
function operatorsFromSecrets(secrets) {
	if (!secrets?.operators) return null;
	const actors = [];
	for (const item of secrets.operators) {
		if (!item.id || !item.name) continue;
		if (item.role !== "admin" && item.role !== "operator" && item.role !== "viewer") continue;
		actors.push({
			id: item.id,
			name: item.name,
			role: item.role,
			allowed: true,
			telegramId: typeof item.telegramId === "number" ? item.telegramId : 0
		});
	}
	return actors.length > 0 ? actors : null;
}
function upsertHost(hosts, next) {
	return [...hosts.filter((host) => host.alias !== next.alias), next];
}
function loadToolConfig(env, secretsText = null) {
	const secrets = parseSecrets(secretsText);
	let sshHosts = defaultHosts();
	const aliases = /* @__PURE__ */ new Set(["mail01"]);
	const listed = env.JARVIS_SSH_HOSTS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
	for (const alias of listed) aliases.add(alias);
	for (const alias of Object.keys(secrets?.ssh?.hosts ?? {})) aliases.add(alias);
	for (const alias of aliases) {
		if (!/^[A-Za-z0-9._-]{1,32}$/.test(alias)) continue;
		const fromFile = secrets?.ssh?.hosts?.[alias];
		const fromEnv = hostFromEnv(env, alias);
		if (!fromFile && !fromEnv && alias === "mail01") continue;
		const host = safeHost(fromEnv?.host ?? fromFile?.host) ?? (alias === "mail01" ? "mail01" : null);
		const user = safeUser(fromEnv?.user ?? fromFile?.user) ?? (alias === "mail01" ? "jarvis" : null);
		if (!host || !user) continue;
		const identityFile = safeIdentityFile(fromEnv?.identityFile ?? fromFile?.identityFile);
		sshHosts = upsertHost(sshHosts, {
			alias,
			host,
			user,
			port: safePort(fromEnv?.port ?? fromFile?.port, 22),
			identityFile,
			configured: Boolean(identityFile)
		});
	}
	const mtHost = safeHost(env.JARVIS_MT_HOST ?? secrets?.mikrotik?.host) ?? "rb5009";
	const mtUser = safeUser(env.JARVIS_MT_USER ?? secrets?.mikrotik?.user) ?? "jarvis-mikrotik";
	const mtPassword = (env.JARVIS_MT_PASSWORD ?? secrets?.mikrotik?.password ?? "").trim();
	const timeout = Number(env.OLLAMA_TIMEOUT_MS ?? "1500");
	return {
		mode: executionModeFromEnv(env.EXECUTION_MODE),
		sshHosts,
		sshAllowRead: splitList(env.JARVIS_SSH_ALLOW_READ) ?? secrets?.ssh?.allowRead ?? [...DEFAULT_SSH_ALLOW_READ],
		sshAllowChange: splitList(env.JARVIS_SSH_ALLOW_CHANGE) ?? secrets?.ssh?.allowChange ?? [...DEFAULT_SSH_ALLOW_CHANGE],
		sshDeny: splitList(env.JARVIS_SSH_DENY) ?? secrets?.ssh?.deny ?? [],
		mikrotik: {
			alias: safeHost(secrets?.mikrotik?.alias) ?? "rb5009",
			host: mtHost,
			user: mtUser,
			password: mtPassword || null,
			port: safePort(env.JARVIS_MT_PORT ?? secrets?.mikrotik?.port, 443),
			tlsInsecure: (env.JARVIS_MT_TLS_INSECURE ?? String(secrets?.mikrotik?.tlsInsecure ?? "false")).toLowerCase() === "true",
			configured: Boolean(mtPassword && mtHost && mtUser)
		},
		ollamaBaseUrl: (env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
		ollamaModel: env.OLLAMA_MODEL?.trim() || "qwen3",
		ollamaTimeoutMs: Number.isFinite(timeout) && timeout >= 200 ? timeout : 1500,
		auditPath: env.JARVIS_AUDIT_PATH?.trim() || "data/audit.jsonl",
		knownHostsPath: env.JARVIS_KNOWN_HOSTS?.trim() || "data/ssh/known_hosts",
		operators: parseOperators(env.JARVIS_OPERATORS) ?? operatorsFromSecrets(secrets)
	};
}
function publicConfig(config) {
	return {
		mode: config.mode,
		ollamaModel: config.ollamaModel,
		ollamaBaseUrl: config.ollamaBaseUrl,
		sshHosts: config.sshHosts.map((host) => ({
			alias: host.alias,
			user: host.user,
			host: host.host,
			port: host.port,
			keyConfigured: host.configured
		})),
		mikrotik: {
			alias: config.mikrotik.alias,
			host: config.mikrotik.host,
			port: config.mikrotik.port,
			configured: config.mikrotik.configured
		}
	};
}
function redactText(input) {
	return input.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-key]").replace(/\b(password|passwd|secret|token|authorization|api[_-]?key)\b(\s*[:=]\s*)(\S+)/gi, "$1$2[redacted]").replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, "Basic [redacted]");
}
function redactRecord(record) {
	return {
		...record,
		command: redactText(record.command).slice(0, 500),
		detail: redactText(record.detail).slice(0, 4e3)
	};
}
function createFileAuditStore(filePath) {
	return {
		async append(record) {
			await mkdir(dirname(filePath), { recursive: true });
			await appendFile(filePath, `${JSON.stringify(redactRecord(record))}\n`, "utf8");
		},
		async list() {
			let text = "";
			try {
				text = await readFile(filePath, "utf8");
			} catch (error) {
				if (error.code === "ENOENT") return [];
				throw error;
			}
			const records = [];
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				try {
					records.push(JSON.parse(line));
				} catch {
					continue;
				}
			}
			return records.reverse().slice(0, 200);
		}
	};
}
var READ_PATHS$1 = /* @__PURE__ */ new Set([
	"/rest/interface",
	"/rest/ip/firewall/filter",
	"/rest/ip/dhcp-server/lease",
	"/rest/log",
	"/rest/system/resource"
]);
function assertMikrotikCall(call) {
	if (!call.path.startsWith("/rest/") || call.path.includes("..") || call.path.includes("?") || call.path.includes("\\")) throw new Error("mikrotik path rejected");
	if (call.method === "GET" && READ_PATHS$1.has(call.path) && call.body === void 0) return;
	if (call.method === "POST" && call.path === "/rest/system/backup/save") {
		const name = call.body?.name;
		if (typeof name !== "string" || !/^jarvis-\d{8}T\d{6}Z$/.test(name)) throw new Error("mikrotik backup name rejected");
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
function createMikrotikClient(config) {
	return { request(call) {
		assertMikrotikCall(call);
		if (!config.configured || !config.password) return Promise.reject(/* @__PURE__ */ new Error("MikroTik credentials are not configured"));
		const payload = call.body ? JSON.stringify(call.body) : null;
		const authorization = `Basic ${Buffer.from(`${config.user}:${config.password}`, "utf8").toString("base64")}`;
		return new Promise((resolve, reject) => {
			const req = nodeHTTPS.request({
				host: config.host,
				port: config.port,
				path: call.path,
				method: call.method,
				rejectUnauthorized: !config.tlsInsecure,
				timeout: 1e4,
				headers: {
					accept: "application/json",
					authorization,
					...payload ? {
						"content-type": "application/json",
						"content-length": Buffer.byteLength(payload)
					} : {}
				}
			}, (res) => {
				const chunks = [];
				res.on("data", (chunk) => {
					chunks.push(chunk);
				});
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString("utf8").slice(0, 8e3)
					});
				});
			});
			req.on("timeout", () => {
				req.destroy(/* @__PURE__ */ new Error("MikroTik request timed out"));
			});
			req.on("error", reject);
			if (payload) req.write(payload);
			req.end();
		});
	} };
}
var TOOL_SPECS = [
	{
		name: "ssh_read",
		risk: "read-only",
		description: "Run one allowlisted read-only command on a configured SSH host. Key auth only.",
		parameters: {
			host: {
				type: "string",
				description: "Host alias from inventory, such as mail01."
			},
			command: {
				type: "string",
				description: "Exact allowlisted command, such as uptime or df -h."
			}
		},
		required: ["host", "command"]
	},
	{
		name: "ssh_change",
		risk: "change",
		description: "Run one allowlisted change command. The runtime holds it until a human approves.",
		parameters: {
			host: {
				type: "string",
				description: "Host alias from inventory."
			},
			command: {
				type: "string",
				description: "Exact allowlisted change, such as systemctl restart nginx."
			}
		},
		required: ["host", "command"]
	},
	{
		name: "mikrotik_interfaces",
		risk: "read-only",
		description: "Read RouterOS interfaces.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_firewall",
		risk: "read-only",
		description: "Read RouterOS firewall filter rules.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_dhcp_leases",
		risk: "read-only",
		description: "Read RouterOS DHCP leases.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_logs",
		risk: "read-only",
		description: "Read RouterOS logs.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_resources",
		risk: "read-only",
		description: "Read RouterOS system resources.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_export",
		risk: "change",
		description: "Save a RouterOS backup. Held for human approval.",
		parameters: {},
		required: []
	},
	{
		name: "mikrotik_set_interface",
		risk: "change",
		description: "Enable or disable one named interface. Held for human approval.",
		parameters: {
			name: {
				type: "string",
				description: "Interface name, such as ether2."
			},
			disabled: {
				type: "boolean",
				description: "True disables the interface."
			}
		},
		required: ["name", "disabled"]
	}
];
var SPEC_BY_NAME = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));
function toolSchemas() {
	return TOOL_SPECS.map((spec) => ({
		type: "function",
		function: {
			name: spec.name,
			description: spec.description,
			parameters: {
				type: "object",
				properties: spec.parameters,
				required: spec.required
			}
		}
	}));
}
function argString(args, key) {
	const value = args[key];
	return typeof value === "string" ? value.trim() : null;
}
function formatSsh(user, host, port, command) {
	return `ssh${port === 22 ? "" : ` -p ${port}`} ${user}@${host} ${command}`;
}
function formatRest(host, port, method, path, body) {
	return `${method} https://${host}:${port}${path}${body ? ` ${JSON.stringify(body)}` : ""}`;
}
var READ_PATHS = {
	mikrotik_interfaces: "/rest/interface",
	mikrotik_firewall: "/rest/ip/firewall/filter",
	mikrotik_dhcp_leases: "/rest/ip/dhcp-server/lease",
	mikrotik_logs: "/rest/log",
	mikrotik_resources: "/rest/system/resource"
};
function backupName(now) {
	return `jarvis-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
}
function prepareToolCall(call, config, now) {
	const spec = SPEC_BY_NAME.get(call.name);
	if (!spec) return {
		ok: false,
		risk: "read-only",
		command: call.name,
		error: "unknown tool"
	};
	if (call.name === "ssh_read" || call.name === "ssh_change") {
		const alias = argString(call.args, "host") ?? "";
		const command = argString(call.args, "command") ?? "";
		const host = config.sshHosts.find((item) => item.alias === alias);
		if (!host) return {
			ok: false,
			risk: spec.risk,
			command: command || call.name,
			error: "host is not configured"
		};
		const assessed = assessSshCommand(command, spec.risk, config.sshAllowRead, config.sshAllowChange, config.sshDeny);
		const shown = formatSsh(host.user, host.host, host.port, command || "(empty)");
		if (!assessed.ok) return {
			ok: false,
			risk: spec.risk,
			command: shown,
			error: assessed.reason
		};
		return {
			ok: true,
			planned: {
				tool: call.name,
				risk: spec.risk,
				host: host.alias,
				command: formatSsh(host.user, host.host, host.port, command),
				action: {
					transport: "ssh",
					host,
					command
				}
			}
		};
	}
	const mt = config.mikrotik;
	if (call.name === "mikrotik_export") {
		const body = { name: backupName(now) };
		return {
			ok: true,
			planned: {
				tool: call.name,
				risk: "change",
				host: mt.alias,
				command: formatRest(mt.host, mt.port, "POST", "/rest/system/backup/save", body),
				action: {
					transport: "mikrotik",
					method: "POST",
					path: "/rest/system/backup/save",
					body
				}
			}
		};
	}
	if (call.name === "mikrotik_set_interface") {
		const name = argString(call.args, "name") ?? "";
		const disabled = call.args.disabled;
		if (!safeInterfaceName(name) || typeof disabled !== "boolean") return {
			ok: false,
			risk: "change",
			command: `PATCH https://${mt.host}:${mt.port}/rest/interface/${name || "?"}`,
			error: "interface name or disabled flag is invalid"
		};
		const body = { disabled };
		const path = `/rest/interface/${name}`;
		return {
			ok: true,
			planned: {
				tool: call.name,
				risk: "change",
				host: mt.alias,
				command: formatRest(mt.host, mt.port, "PATCH", path, body),
				action: {
					transport: "mikrotik",
					method: "PATCH",
					path,
					body
				}
			}
		};
	}
	const path = READ_PATHS[call.name];
	if (!path) return {
		ok: false,
		risk: spec.risk,
		command: call.name,
		error: "unknown tool"
	};
	return {
		ok: true,
		planned: {
			tool: call.name,
			risk: "read-only",
			host: mt.alias,
			command: formatRest(mt.host, mt.port, "GET", path),
			action: {
				transport: "mikrotik",
				method: "GET",
				path
			}
		}
	};
}
var ToolEngine = class {
	config;
	audit;
	ssh;
	mikrotik;
	now;
	id;
	pending = /* @__PURE__ */ new Map();
	seq = 0;
	constructor(deps) {
		this.config = deps.config;
		this.audit = deps.audit;
		this.ssh = deps.ssh;
		this.mikrotik = deps.mikrotik;
		this.now = deps.now ?? (() => /* @__PURE__ */ new Date());
		this.id = deps.id ?? ((prefix) => {
			this.seq += 1;
			return `${prefix}-${this.seq}`;
		});
	}
	async call(actor, toolCall) {
		if (!actor.allowed) return this.record(actor, {
			tool: toolCall.name || "none",
			risk: "read-only",
			host: "—",
			command: toolCall.name || "none",
			result: "denied",
			detail: "actor is not allowed",
			approvalId: null
		});
		const prepared = prepareToolCall(toolCall, this.config, this.now());
		if (!prepared.ok) return this.record(actor, {
			tool: toolCall.name,
			risk: prepared.risk,
			host: "—",
			command: prepared.command,
			result: "denied",
			detail: prepared.error,
			approvalId: null
		});
		const planned = prepared.planned;
		if (planned.risk === "read-only") {
			if (this.config.mode === "dry-run") return this.record(actor, {
				tool: planned.tool,
				risk: planned.risk,
				host: planned.host,
				command: planned.command,
				result: "dry_run",
				detail: "dry-run: command was not sent",
				approvalId: null
			});
			try {
				const output = await this.execute(planned);
				return this.record(actor, {
					tool: planned.tool,
					risk: planned.risk,
					host: planned.host,
					command: planned.command,
					result: "executed",
					detail: output,
					approvalId: null
				});
			} catch (error) {
				return this.record(actor, {
					tool: planned.tool,
					risk: planned.risk,
					host: planned.host,
					command: planned.command,
					result: "error",
					detail: error instanceof Error ? error.message : "execution failed",
					approvalId: null
				});
			}
		}
		const approvalId = this.id("apr");
		this.pending.set(approvalId, {
			id: approvalId,
			planned,
			requestedBy: actor.id
		});
		return this.record(actor, {
			tool: planned.tool,
			risk: "change",
			host: planned.host,
			command: planned.command,
			result: "awaiting_approval",
			detail: "waiting for Approve or Reject",
			approvalId
		});
	}
	async decide(actor, approvalId, decision) {
		if (!actor.allowed || !canApprove(actor.role)) return this.record(actor, {
			tool: "approval",
			risk: "change",
			host: "—",
			command: approvalId,
			result: "forbidden",
			detail: "only operator or admin can approve",
			approvalId
		});
		const pending = this.pending.get(approvalId);
		if (!pending) return this.record(actor, {
			tool: "approval",
			risk: "change",
			host: "—",
			command: approvalId,
			result: "error",
			detail: "approval not found",
			approvalId
		});
		this.pending.delete(approvalId);
		const planned = pending.planned;
		if (decision === "reject") return this.record(actor, {
			tool: planned.tool,
			risk: "change",
			host: planned.host,
			command: planned.command,
			result: "rejected",
			detail: `rejected. requested by ${pending.requestedBy}`,
			approvalId
		});
		if (this.config.mode === "dry-run") return this.record(actor, {
			tool: planned.tool,
			risk: "change",
			host: planned.host,
			command: planned.command,
			result: "approved_dry_run",
			detail: `approved in dry-run; command was not sent. requested by ${pending.requestedBy}`,
			approvalId
		});
		try {
			const output = await this.execute(planned);
			return this.record(actor, {
				tool: planned.tool,
				risk: "change",
				host: planned.host,
				command: planned.command,
				result: "executed",
				detail: output,
				approvalId
			});
		} catch (error) {
			return this.record(actor, {
				tool: planned.tool,
				risk: "change",
				host: planned.host,
				command: planned.command,
				result: "error",
				detail: error instanceof Error ? error.message : "execution failed",
				approvalId
			});
		}
	}
	async execute(planned) {
		if (planned.action.transport === "ssh") {
			if (!planned.action.host.configured || !planned.action.host.identityFile) throw new Error("SSH identity file is not configured");
			return (await this.ssh({
				host: planned.action.host,
				command: planned.action.command,
				knownHostsPath: this.config.knownHostsPath
			})).output;
		}
		assertMikrotikCall(planned.action);
		if (!this.config.mikrotik.configured) throw new Error("MikroTik credentials are not configured");
		const result = await this.mikrotik.request({
			method: planned.action.method,
			path: planned.action.path,
			body: planned.action.body
		});
		return `HTTP ${result.status}\n${result.body}`;
	}
	async record(actor, fields) {
		const call = {
			id: this.id("call"),
			tool: fields.tool,
			risk: fields.risk,
			host: fields.host,
			command: redactText(fields.command).slice(0, 500),
			result: fields.result,
			detail: redactText(fields.detail).slice(0, 4e3),
			approvalId: fields.approvalId
		};
		const audit = {
			id: this.id("aud"),
			at: this.now().toISOString(),
			actorId: actor.id,
			actorName: actor.name,
			role: actor.role,
			tool: call.tool,
			risk: call.risk,
			command: call.command,
			host: call.host,
			mode: this.config.mode,
			approvalId: call.approvalId,
			result: call.result,
			detail: call.detail
		};
		await this.audit.append(audit);
		return call;
	}
};
function toolSystemPrompt(config) {
	return [
		"You are JARVIS, a sysadmin assistant. Use only the provided tools.",
		"If the request is not about SSH or MikroTik, do not call a tool.",
		"Read-only tools may run immediately. Change tools are held until a human presses Approve or Reject. Do not claim a change already ran.",
		`SSH read allowlist: ${config.sshAllowRead.join(" | ")}`,
		`SSH change allowlist: ${config.sshAllowChange.join(" | ")}`,
		"Never use shell operators, pipes, redirects, command substitution, or commands outside the allowlist.",
		`SSH hosts: ${config.sshHosts.map((host) => host.alias).join(", ")}`,
		`Router alias: ${config.mikrotik.alias}`,
		"Do not ask for or repeat passwords, keys, or tokens."
	].join("\n");
}
function asArgs(value) {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
		} catch {
			return {};
		}
		return {};
	}
	if (value && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
function parseOllamaChat(payload) {
	const message = payload?.message;
	const text = typeof message?.content === "string" ? message.content : "";
	const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
	const toolCalls = [];
	for (const item of rawCalls) {
		const fn = item.function;
		if (!fn || typeof fn.name !== "string" || !fn.name.trim()) continue;
		toolCalls.push({
			name: fn.name.trim(),
			args: asArgs(fn.arguments)
		});
	}
	return {
		text,
		toolCalls
	};
}
async function planWithOllama(options) {
	const fetchImpl = options.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? options.config.ollamaTimeoutMs);
	try {
		const response = await fetchImpl(`${options.config.ollamaBaseUrl}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			signal: controller.signal,
			body: JSON.stringify({
				model: options.config.ollamaModel,
				stream: false,
				messages: options.messages.map((message) => ({
					role: message.role,
					content: message.content,
					...message.toolName ? { tool_name: message.toolName } : {}
				})),
				tools: options.tools
			})
		});
		if (!response.ok) return null;
		return parseOllamaChat(await response.json());
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
function createPlanner(config, fetchImpl) {
	return async (messages, tools) => {
		const ollama = await planWithOllama({
			messages,
			tools,
			config,
			fetchImpl
		});
		const hasToolRound = messages.some((message) => message.role === "tool");
		if (ollama && ollama.toolCalls.length > 0) return ollama;
		if (!hasToolRound) {
			const user = [...messages].reverse().find((message) => message.role === "user");
			const heuristic = heuristicPlan(user?.content ?? "");
			if (heuristic.toolCalls.length > 0) return heuristic;
		}
		if (ollama) return ollama;
		return {
			text: "",
			toolCalls: []
		};
	};
}
async function runToolLoop(options) {
	const tools = toolSchemas();
	const messages = [{
		role: "system",
		content: toolSystemPrompt(options.config)
	}, {
		role: "user",
		content: options.text
	}];
	const calls = [];
	const maxRounds = options.maxRounds ?? 3;
	const maxCalls = options.maxCalls ?? 4;
	let assistant = "";
	for (let round = 0; round < maxRounds; round += 1) {
		let planned;
		try {
			planned = await options.planner(messages, tools);
		} catch {
			if (round === 0 && calls.length === 0) return {
				handled: false,
				assistant: "",
				calls: []
			};
			break;
		}
		if (planned.text) assistant = planned.text;
		if (planned.toolCalls.length === 0) {
			if (round === 0) return {
				handled: false,
				assistant: "",
				calls: []
			};
			break;
		}
		let held = false;
		for (const toolCall of planned.toolCalls) {
			if (calls.length >= maxCalls) break;
			const result = await options.engine.call(options.actor, toolCall);
			calls.push(result);
			messages.push({
				role: "tool",
				toolName: result.tool,
				content: `${result.result}: ${result.detail}`.slice(0, 4e3)
			});
			if (result.result === "awaiting_approval") held = true;
		}
		if (held || calls.length >= maxCalls) break;
	}
	if (calls.length === 0) return {
		handled: false,
		assistant: "",
		calls: []
	};
	if (!assistant) assistant = calls.map((call) => `${call.tool} ${call.result}`).join(" · ");
	return {
		handled: true,
		assistant,
		calls
	};
}
function buildSshArgs(request) {
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
		"StrictHostKeyChecking=accept-new",
		"-o",
		`UserKnownHostsFile=${request.knownHostsPath}`,
		"-o",
		"ConnectTimeout=8",
		`${request.host.user}@${request.host.host}`,
		request.command
	];
}
function createSshExecutor() {
	return async (request) => {
		const args = buildSshArgs(request);
		await mkdir(dirname(request.knownHostsPath), { recursive: true });
		return new Promise((resolve, reject) => {
			const child = spawn("ssh", args, {
				shell: false,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			let stdout = "";
			let stderr = "";
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
			}, 15e3);
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk) => {
				if (stdout.length < 12e3) stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				if (stderr.length < 4e3) stderr += chunk;
			});
			child.on("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.on("close", (code) => {
				clearTimeout(timer);
				const output = [
					`exit ${code ?? 1}`,
					stdout.trim(),
					stderr.trim()
				].filter(Boolean).join("\n");
				resolve({
					exitCode: code ?? 1,
					output: output.slice(0, 8e3)
				});
			});
		});
	};
}
var engine = null;
var planner = null;
async function readSecrets() {
	const path = process.env.JARVIS_SECRETS_FILE?.trim();
	if (!path) return null;
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}
async function getRuntime() {
	if (engine && planner) return {
		engine,
		planner
	};
	const config = loadToolConfig(process.env, await readSecrets());
	engine = new ToolEngine({
		config,
		audit: createFileAuditStore(config.auditPath),
		ssh: createSshExecutor(),
		mikrotik: createMikrotikClient(config.mikrotik)
	});
	planner = createPlanner(config);
	return {
		engine,
		planner
	};
}
async function handleStatus() {
	const { engine: current } = await getRuntime();
	const actors = (current.config.operators ?? DEMO_ACTORS).map((actor) => ({
		id: actor.id,
		name: actor.name,
		role: actor.role,
		allowed: actor.allowed
	}));
	return {
		...publicConfig(current.config),
		actors
	};
}
async function handleRunTurn(input) {
	const { engine: current, planner: plan } = await getRuntime();
	const actor = resolveActor(input.operatorId, current.config.operators);
	if (!actor?.allowed) return {
		handled: false,
		assistant: "",
		calls: [],
		mode: current.config.mode
	};
	const result = await runToolLoop({
		text: input.message,
		actor,
		planner: plan,
		engine: current,
		config: current.config
	});
	return {
		handled: result.handled,
		assistant: result.assistant,
		calls: result.calls,
		mode: current.config.mode
	};
}
async function handleDecide(input) {
	const { engine: current } = await getRuntime();
	const actor = resolveActor(input.operatorId, current.config.operators);
	if (!actor) return {
		ok: false,
		error: "unknown actor",
		call: null
	};
	const call = await current.decide(actor, input.approvalId, input.decision);
	return {
		ok: call.result !== "forbidden" && call.result !== "error",
		error: call.result === "forbidden" || call.result === "error" ? call.detail : null,
		call
	};
}
async function handleListAudit(operatorId) {
	const { engine: current } = await getRuntime();
	if (!resolveActor(operatorId, current.config.operators)?.allowed) return {
		forbidden: true,
		records: []
	};
	return {
		forbidden: false,
		records: await current.audit.list()
	};
}
//#endregion
export { handleDecide, handleListAudit, handleRunTurn, handleStatus };
