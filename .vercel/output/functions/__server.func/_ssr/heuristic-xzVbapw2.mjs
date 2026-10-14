//#region node_modules/.nitro/vite/services/ssr/assets/heuristic-xzVbapw2.js
function normalize(raw) {
	return raw.toLowerCase().replace(/ё/g, "е");
}
function interfaceName(text) {
	return text.match(/\b((?:ether|wlan|sfp|lte|vlan|pppoe)\d+|bridge(?:-[a-z0-9]+)?|wg-[a-z0-9-]+)\b/i)?.[1] ?? null;
}
function heuristicPlan(text) {
	const explicit = text.match(/\bssh\s+([A-Za-z0-9._-]+)\s+(\S(?:.*\S)?)\s*$/i);
	if (explicit) {
		const host = explicit[1] ?? "";
		const command = (explicit[2] ?? "").trim();
		return {
			text: "",
			toolCalls: [{
				name: /^systemctl restart /.test(command) ? "ssh_change" : "ssh_read",
				args: {
					host,
					command
				}
			}]
		};
	}
	const s = normalize(text);
	if (/mikrotik|микротик|rb5009|routeros/.test(s)) {
		if (/выключ|disable/.test(s)) {
			const name = interfaceName(text);
			if (name) return {
				text: "",
				toolCalls: [{
					name: "mikrotik_set_interface",
					args: {
						name,
						disabled: true
					}
				}]
			};
		}
		if (/(^|[^а-я])включ|enable/.test(s) && /интерфейс|ether|wlan|sfp|lte/.test(s)) {
			const name = interfaceName(text);
			if (name) return {
				text: "",
				toolCalls: [{
					name: "mikrotik_set_interface",
					args: {
						name,
						disabled: false
					}
				}]
			};
		}
		if (/firewall|файрвол|фильтр/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_firewall",
				args: {}
			}]
		};
		if (/dhcp|аренд/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_dhcp_leases",
				args: {}
			}]
		};
		if (/лог/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_logs",
				args: {}
			}]
		};
		if (/ресурс|cpu|памят/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_resources",
				args: {}
			}]
		};
		if (/export|бэкап|backup|резерв/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_export",
				args: {}
			}]
		};
		if (/интерфейс/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "mikrotik_interfaces",
				args: {}
			}]
		};
		return {
			text: "",
			toolCalls: [{
				name: "mikrotik_resources",
				args: {}
			}, {
				name: "mikrotik_interfaces",
				args: {}
			}]
		};
	}
	if (/\bmail01\b/i.test(text)) {
		const host = "mail01";
		if (/restart|перезапуст/.test(s)) {
			const service = s.match(/\b(nginx|postfix|dovecot)\b/);
			if (!service) return {
				text: "",
				toolCalls: []
			};
			return {
				text: "",
				toolCalls: [{
					name: "ssh_change",
					args: {
						host,
						command: `systemctl restart ${service[1]}`
					}
				}]
			};
		}
		if (/диск|место|\bdf\b/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "ssh_read",
				args: {
					host,
					command: "df -h"
				}
			}]
		};
		if (/docker|докер/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "ssh_read",
				args: {
					host,
					command: "docker ps"
				}
			}]
		};
		if (/памят|\bfree\b/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "ssh_read",
				args: {
					host,
					command: "free -m"
				}
			}]
		};
		if (/uptime|нагрузк|ssh/.test(s)) return {
			text: "",
			toolCalls: [{
				name: "ssh_read",
				args: {
					host,
					command: "uptime"
				}
			}]
		};
	}
	return {
		text: "",
		toolCalls: []
	};
}
//#endregion
export { heuristicPlan as t };
