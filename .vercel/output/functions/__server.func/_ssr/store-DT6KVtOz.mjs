import { i as getServerFnById, n as createServerFn, r as TSS_SERVER_FUNCTION } from "./ssr.mjs";
import { t as heuristicPlan } from "./heuristic-xzVbapw2.mjs";
import { H as string, j as _enum, z as object } from "../_libs/@better-auth/core+[...].mjs";
import { b as evaluate, p as OPERATORS } from "./router-ANjjZ9ur.mjs";
import { t as create } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/store-DT6KVtOz.js
var WATCH_HOSTS = [
	{
		id: "dc01",
		level: "ok",
		note: "AD отвечает"
	},
	{
		id: "srv1c01",
		level: "warn",
		note: "ошибка проведения"
	},
	{
		id: "sql01",
		level: "warn",
		note: "нагрузка backup"
	},
	{
		id: "fs01",
		level: "ok",
		note: "диск 62%"
	},
	{
		id: "mail01",
		level: "bad",
		note: "диск и SSH"
	},
	{
		id: "rb5009",
		level: "warn",
		note: "LTE молчит"
	}
];
var WATCH_ALERTS = [
	{
		id: "disk-mail",
		host: "mail01",
		area: "диски",
		level: "bad",
		title: "На почтовом сервере кончается место",
		where: "mail01, том /. Свободно 12%.",
		broke: "Место съели журналы почты и каталог docker. Почта ещё принимает письма, но запас маленький.",
		fix: "Само ничего не удаляю. Если чистить, назовите объект: журналы старше 30 дней на mail01. Это уже изменение с подтверждением.",
		command: "Проверь свободное место на всех серверах"
	},
	{
		id: "lte",
		host: "rb5009",
		area: "канал",
		level: "warn",
		title: "Резервный интернет не поднят",
		where: "rb5009, интерфейс lte1.",
		broke: "LTE не в состоянии running уже 14 часов. Основной канал жив, поэтому пользователи этого пока не замечают.",
		fix: "Похоже на питание или регистрацию модема, не на маршрут. Другой default route сам не включу.",
		command: "Почему не работает резервный интернет"
	},
	{
		id: "ssh",
		host: "mail01",
		area: "безопасность",
		level: "bad",
		title: "Перебор входа по SSH",
		where: "mail01, порт 22, адрес 185.22.10.4.",
		broke: "За час 40 неудачных входов с одного адреса. Взлома нет: сессия не открылась. Порт при этом отвечает из интернета.",
		fix: "Firewall сам не меняю. Закрыть 22 снаружи и оставить вход через WireGuard. Бан адреса — отдельное подтверждение, не эта сводка.",
		command: "Посмотри WireGuard"
	},
	{
		id: "posting",
		host: "srv1c01",
		area: "ошибки",
		level: "warn",
		title: "1С не провела документ",
		where: "srv1c01, Реализация 00001482, сегодня в 13:41.",
		broke: "В журнале: поле СтавкаНДС не найдено в выборке. Стек указывает на расширение, строка 214. Кластер при этом работает.",
		fix: "Рестарт 1С здесь не поможет. Нужна правка запроса в расширении, не в рабочей базе. Документ сам не перепровожу.",
		command: "Разбери стек проведения"
	},
	{
		id: "sql-load",
		host: "sql01",
		area: "нагрузка",
		level: "warn",
		title: "SQL нагружен, это не авария",
		where: "sql01, база utp.",
		broke: "CPU около 74%. Совпадает с окном backup, сессии пользователей на месте, база ONLINE.",
		fix: "Ничего не рвать. Если backup не ваш, дождитесь конца снимка и проверьте, что файл на NAS не пустой.",
		command: "Проверь базу utp"
	}
];
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var RunInput = object({
	message: string().trim().min(1).max(2e3),
	operatorId: string().trim().min(1).max(64)
});
var DecideInput = object({
	approvalId: string().trim().min(1).max(80),
	decision: _enum(["approve", "reject"]),
	operatorId: string().trim().min(1).max(64)
});
var AuditInput = object({ operatorId: string().trim().min(1).max(64) });
var getToolStatus = createServerFn({ method: "GET" }).handler(createSsrRpc("66e6294edd257c54b492c5bb5b3fd36422e980a3cfeb232c8d906825411cf2ba"));
var runAssistantTurn = createServerFn({ method: "POST" }).validator((data) => RunInput.parse(data)).handler(createSsrRpc("03e9f5687141a7598029dc49219cd0bdbf23b7a55d2307a733a9cc1c7637e519"));
var decideToolApproval = createServerFn({ method: "POST" }).validator((data) => DecideInput.parse(data)).handler(createSsrRpc("d249e7c0fb4d0d241796fe99c68a8d9a7942ba607fc4d3d78f6895caf1ba99f9"));
var listToolAudit = createServerFn({ method: "POST" }).validator((data) => AuditInput.parse(data)).handler(createSsrRpc("05c40de878a708fedf7b5c5e1af64ed2854b1161fe1390c5ec85fe2e162b8cef"));
function csrf() {
	const match = document.cookie.match(/(?:^|; )jarvis_csrf=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : "";
}
function unavailableDecision(reason) {
	return {
		id: "unknown",
		title: "Политика недоступна",
		normalized: "unknown",
		risk: 3,
		tool: "—",
		target: "—",
		runbook: null,
		account: "—",
		parameters: [],
		confirmation: "none",
		mutation: false,
		forceDeny: true,
		clarify: false,
		denyReason: reason,
		clarifyReason: null,
		plan: [],
		toolCall: "—",
		consequences: [],
		findings: [],
		recommendation: null,
		durationMs: 0,
		verdict: "deny",
		reason,
		policyNotes: ["Сервер не ответил. Локальное разрешение не выдаётся."],
		previewFindings: false
	};
}
async function ensureServerSession() {
	const response = await fetch("/api/session", { credentials: "include" });
	const body = await response.json();
	const code = body.code || (response.ok ? "OK" : "AUTH_REQUIRED");
	return {
		ok: response.ok && code === "OK",
		code,
		executionMode: body.executionMode || "dry-run",
		role: body.role,
		actorId: body.actorId,
		userId: body.userId
	};
}
async function postCommand(text, requestId, approval) {
	const body = await (await fetch("/api/commands", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
			"x-jarvis-csrf": csrf()
		},
		body: JSON.stringify({
			text,
			request_id: requestId,
			...approval ? {
				approval_id: approval.id,
				confirmation: approval.confirmation
			} : {}
		})
	})).json();
	if (!body.decision || !body.trace) {
		const reason = body.code || "политика недоступна";
		return {
			code: body.code || "AUTH_REQUIRED",
			verdict: "deny",
			mode: "dry-run",
			executionCalled: false,
			auditId: "",
			requestId,
			approval: null,
			decision: unavailableDecision(reason),
			trace: {
				original: text,
				normalized: "—",
				steps: ["authenticate"],
				constraint: "нет",
				target: "—",
				runbook: "—",
				risk: 3,
				policy: "DENY",
				mode: "dry-run",
				execution: "не вызывался",
				verification: "нет",
				audit: "—"
			}
		};
	}
	return body;
}
async function postVoiceHear(wav, signal) {
	const response = await fetch("/api/voice", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "audio/wav",
			"x-jarvis-csrf": csrf()
		},
		body: wav,
		signal
	});
	const body = await response.json();
	return {
		code: body.code || (response.ok ? "STT_FAILED" : "AUTH_REQUIRED"),
		text: body.text ?? null,
		raw: body.raw ?? null,
		confidence: body.confidence ?? null,
		message: body.message ?? null
	};
}
async function postVoiceTurn(text, requestId, signal) {
	const body = await (await fetch("/api/voice", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
			"x-jarvis-csrf": csrf()
		},
		body: JSON.stringify({
			action: "turn",
			text,
			request_id: requestId
		}),
		signal
	})).json();
	if (!body.spoken && !body.command) return {
		code: body.code || "AUTH_REQUIRED",
		spoken: "",
		sentences: [],
		kind: "agent",
		executionCalled: false,
		mode: "dry-run",
		tts: false,
		command: null,
		answer: null
	};
	return {
		code: body.code || "OK",
		spoken: body.spoken || "",
		sentences: body.sentences ?? [],
		kind: body.kind || "agent",
		executionCalled: Boolean(body.executionCalled),
		mode: body.mode || "dry-run",
		tts: Boolean(body.tts),
		command: body.command ?? null,
		answer: body.answer ?? null
	};
}
async function postVoiceSpeak(text, signal) {
	const response = await fetch("/api/voice", {
		method: "POST",
		credentials: "include",
		headers: {
			"content-type": "application/json",
			"x-jarvis-csrf": csrf()
		},
		body: JSON.stringify({
			action: "speak",
			text
		}),
		signal
	});
	const type = response.headers.get("content-type") ?? "";
	if (response.ok && type.includes("audio/")) return {
		ok: true,
		audio: await response.arrayBuffer()
	};
	try {
		return {
			ok: false,
			code: (await response.json()).code || "TTS_FAILED"
		};
	} catch {
		return {
			ok: false,
			code: "TTS_FAILED"
		};
	}
}
function uid(prefix) {
	return `${prefix}-${crypto.randomUUID()}`;
}
function operatorById(id) {
	return OPERATORS.find((item) => item.id === id) ?? OPERATORS[0];
}
function toolDecision(text, operator, remote) {
	const base = evaluate(text, operator, /* @__PURE__ */ new Date());
	const change = remote.calls.some((call) => call.risk === "change");
	const waiting = remote.calls.some((call) => call.result === "awaiting_approval");
	return {
		...base,
		title: remote.calls.length === 1 ? remote.calls[0]?.tool ?? "Инструмент" : "Инструменты",
		risk: change ? 2 : 0,
		tool: remote.calls.map((call) => call.tool).join(", "),
		target: remote.calls.map((call) => call.host).join(", "),
		mutation: change,
		confirmation: waiting ? "single" : "none",
		plan: remote.calls.map((call) => `${call.tool}: ${call.result}`),
		toolCall: remote.calls.map((call) => call.command).join("\n"),
		consequences: [],
		findings: [],
		recommendation: null,
		reason: null,
		policyNotes: [
			`Режим инструментов: ${remote.mode}`,
			`Роль: ${operator.role}`,
			...base.policyNotes
		],
		previewFindings: false,
		verdict: "allow"
	};
}
function paramsOf(decision) {
	if (decision.parameters.length === 0) return "—";
	return decision.parameters.map((item) => `${item.key}=${item.value}`).join(", ");
}
function auditFrom(turn, user, result, error, approvalId) {
	return {
		id: uid("aud"),
		at: Date.now(),
		user,
		source: turn.source === "voice" ? "telegram-voice" : "telegram-text",
		request: turn.request,
		intent: turn.decision.normalized,
		tool: turn.decision.tool,
		target: turn.decision.target,
		parameters: paramsOf(turn.decision),
		risk: turn.decision.risk,
		approvalId,
		template: turn.decision.runbook ?? "—",
		result,
		exitCode: turn.exitCode,
		durationMs: turn.durationMs,
		error
	};
}
var lock = false;
var useJarvis = create((set, get) => ({
	actorId: "unauthenticated",
	authCode: "",
	authUserId: null,
	sessionReady: false,
	operatorId: "admin1",
	dryRun: true,
	serverMode: "dry-run",
	watch: true,
	busy: false,
	now: 0,
	seq: 17,
	turns: [],
	notices: [],
	audit: [],
	auditEpoch: 0,
	setOperator: (id) => set({ operatorId: id }),
	setDryRun: (value) => set({ dryRun: value }),
	setWatch: (value) => set({ watch: value }),
	ensureSession: async () => {
		try {
			const session = await ensureServerSession();
			set({
				serverMode: session.executionMode,
				dryRun: session.executionMode !== "real",
				actorId: session.ok ? session.actorId ?? "authenticated" : "unauthenticated",
				authCode: session.code,
				authUserId: session.userId ?? null,
				sessionReady: true
			});
		} catch {
			set({
				serverMode: "dry-run",
				dryRun: true,
				actorId: "unauthenticated",
				authCode: "AUTH_REQUIRED",
				authUserId: null,
				sessionReady: true
			});
		}
	},
	pushNotice: (id) => {
		const state = get();
		if (!state.watch || state.notices.some((item) => item.id === id)) return;
		const alert = WATCH_ALERTS.find((item) => item.id === id);
		if (!alert) return;
		const notice = {
			...alert,
			at: Date.now()
		};
		const user = state.actorId;
		const entry = {
			id: uid("aud"),
			at: notice.at,
			user,
			source: "demo",
			request: notice.title,
			intent: "watch",
			tool: "watch_hosts",
			target: notice.host,
			parameters: notice.area,
			risk: 0,
			approvalId: null,
			template: "—",
			result: "watch_report",
			exitCode: null,
			durationMs: null,
			error: null
		};
		set({
			notices: [...state.notices, notice],
			audit: [entry, ...state.audit].slice(0, 80)
		});
	},
	tick: (ts) => {
		const state = get();
		const user = state.actorId;
		const extra = [];
		let changed = false;
		const turns = state.turns.map((turn) => {
			if (turn.phase !== "awaiting" || !turn.approval || ts <= turn.approval.expiresAt) return turn;
			changed = true;
			const next = {
				...turn,
				phase: "expired",
				hint: "Срок заявки истёк. Повторите команду."
			};
			extra.push(auditFrom(next, user, "expired", "approval ttl", turn.approval.id));
			return next;
		});
		if (!changed) {
			set({ now: ts });
			return;
		}
		set({
			now: ts,
			turns,
			audit: [...extra, ...state.audit].slice(0, 80)
		});
	},
	showVoiceResult: (payload, heard) => {
		const user = get().actorId;
		const at = Date.now();
		if (payload.command) {
			const result = payload.command;
			const request = result.trace.original || heard || payload.spoken;
			const phase = result.approval ? "awaiting" : result.decision.verdict === "deny" ? "denied" : "done";
			const next = {
				id: uid("turn"),
				source: "voice",
				request,
				heard: heard && heard.trim() && heard.trim() !== request ? heard.trim() : null,
				at,
				phase,
				step: 4,
				decision: result.decision,
				approval: result.approval ? {
					id: result.approval.id,
					stage: result.approval.stage,
					expiresAt: result.approval.expiresAt,
					phrase: result.approval.phrase
				} : null,
				executed: result.executionCalled,
				showFindings: result.decision.verdict === "allow" && result.decision.findings.length > 0,
				dryRun: result.mode !== "real",
				exitCode: result.decision.verdict === "allow" ? 0 : 1,
				durationMs: result.decision.durationMs,
				hint: result.decision.reason,
				replies: [],
				trace: result.trace,
				serverCode: result.code
			};
			set({
				turns: [...get().turns, next],
				serverMode: result.mode || get().serverMode,
				audit: [auditFrom(next, user, result.code, result.decision.reason, result.approval?.id ?? null), ...get().audit].slice(0, 80)
			});
			return;
		}
		const answer = (payload.answer || payload.spoken || "Ответа нет.").trim();
		const verdict = payload.code === "OK" || payload.code === "DRY_RUN" || payload.code === "CLARIFY" || payload.code === "AGENT_PARTIAL" ? "clarify" : "deny";
		const decision = {
			id: "unknown",
			title: answer.length > 180 ? `${answer.slice(0, 177).trimEnd()}…` : answer,
			normalized: "voice-chat",
			risk: 0,
			tool: "разговор",
			target: "—",
			runbook: null,
			account: "—",
			parameters: [],
			confirmation: "none",
			mutation: false,
			forceDeny: verdict === "deny",
			clarify: verdict === "clarify",
			denyReason: verdict === "deny" ? answer : null,
			clarifyReason: verdict === "clarify" ? answer : null,
			plan: [],
			toolCall: "—",
			consequences: [],
			findings: [],
			recommendation: null,
			durationMs: 0,
			verdict,
			reason: answer.length > 180 ? answer : null,
			policyNotes: ["Голосовой ответ. Голос ничего не подтверждает и не выполняет."],
			previewFindings: false
		};
		const next = {
			id: uid("turn"),
			source: "voice",
			request: heard?.trim() || "голос",
			heard: null,
			at,
			phase: verdict === "deny" ? "denied" : "done",
			step: 4,
			decision,
			approval: null,
			executed: false,
			showFindings: false,
			dryRun: (payload.mode || get().serverMode) !== "real",
			exitCode: null,
			durationMs: null,
			hint: null,
			replies: [],
			trace: null,
			serverCode: payload.code
		};
		set({
			turns: [...get().turns, next],
			audit: [auditFrom(next, user, payload.code, null, null), ...get().audit].slice(0, 80)
		});
	},
	resolveApproval: async (approvalId, decision) => {
		const operator = operatorById(get().operatorId);
		try {
			const result = await decideToolApproval({ data: {
				approvalId,
				decision,
				operatorId: operator.id
			} });
			set({
				auditEpoch: get().auditEpoch + 1,
				turns: get().turns.map((turn) => {
					if (!turn.toolRun?.calls.some((call) => call.approvalId === approvalId)) return turn;
					const calls = turn.toolRun.calls.map((call) => call.approvalId === approvalId && result.call ? result.call : call);
					const waiting = calls.some((call) => call.result === "awaiting_approval");
					return {
						...turn,
						toolRun: {
							...turn.toolRun,
							calls
						},
						phase: waiting ? "awaiting" : "done",
						hint: result.ok ? null : result.error,
						executed: calls.some((call) => call.result === "executed")
					};
				})
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Не удалось записать решение.";
			set({ turns: get().turns.map((turn) => turn.toolRun?.calls.some((call) => call.approvalId === approvalId) ? {
				...turn,
				hint: message
			} : turn) });
		}
	},
	cancel: (turnId) => {
		const state = get();
		const turn = state.turns.find((item) => item.id === turnId);
		if (!turn || turn.phase !== "awaiting") return;
		const next = {
			...turn,
			phase: "cancelled",
			hint: "Заявка отменена. Ничего не менялось."
		};
		const user = state.actorId;
		set({
			turns: state.turns.map((item) => item.id === turnId ? next : item),
			audit: [auditFrom(next, user, "cancelled", null, turn.approval?.id ?? null), ...state.audit].slice(0, 80)
		});
	},
	reply: async (turnId, phrase) => {
		const text = phrase.trim();
		if (!text || lock) return;
		const turn = get().turns.find((item) => item.id === turnId);
		if (!turn || turn.phase !== "awaiting" || !turn.approval) return;
		lock = true;
		set({ busy: true });
		try {
			const result = await postCommand(turn.request, uid("req"), {
				id: turn.approval.id,
				confirmation: text
			});
			const user = get().actorId;
			const phase = result.approval ? "awaiting" : result.verdict === "deny" ? "denied" : "done";
			const next = {
				...turn,
				replies: [...turn.replies, text],
				phase,
				step: 4,
				decision: result.decision,
				approval: result.approval ? {
					id: result.approval.id,
					stage: result.approval.stage,
					expiresAt: result.approval.expiresAt,
					phrase: result.approval.phrase
				} : null,
				executed: result.executionCalled,
				showFindings: result.verdict === "allow",
				dryRun: result.mode !== "real",
				trace: result.trace,
				serverCode: result.code,
				hint: result.decision.reason,
				exitCode: result.verdict === "allow" ? 0 : 1,
				durationMs: result.decision.durationMs
			};
			set({
				turns: get().turns.map((item) => item.id === turnId ? next : item),
				audit: [auditFrom(next, user, result.code, result.decision.reason, result.approval?.id ?? null), ...get().audit].slice(0, 80)
			});
		} finally {
			lock = false;
			set({ busy: false });
		}
	},
	submit: async (raw, source, heard) => {
		const text = raw.trim();
		if (!text || lock) return;
		const pending = get().turns.find((item) => item.phase === "awaiting" && !item.toolRun);
		if (pending && heuristicPlan(text).toolCalls.length === 0) {
			if (/^отмена$/i.test(text) || /^cancel$/i.test(text)) {
				get().cancel(pending.id);
				return;
			}
			await get().reply(pending.id, text);
			return;
		}
		lock = true;
		set({ busy: true });
		try {
			const operator = operatorById(get().operatorId);
			if (!operator.allowed) {
				const decision = evaluate(text, operator, /* @__PURE__ */ new Date());
				const turn = {
					id: uid("turn"),
					source,
					request: text,
					heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
					at: Date.now(),
					phase: "denied",
					step: 4,
					decision,
					approval: null,
					executed: false,
					showFindings: false,
					dryRun: true,
					exitCode: 1,
					durationMs: decision.durationMs,
					hint: decision.reason,
					replies: [],
					trace: null,
					serverCode: "ACTOR_DENIED"
				};
				set({
					turns: [...get().turns, turn],
					audit: [auditFrom(turn, operator.name, "denied", decision.reason, null), ...get().audit].slice(0, 80)
				});
				return;
			}
			try {
				const remote = await runAssistantTurn({ data: {
					message: text,
					operatorId: operator.id
				} });
				if (remote.handled) {
					const decision = toolDecision(text, operator, remote);
					const waiting = remote.calls.some((call) => call.result === "awaiting_approval");
					const denied = remote.calls.every((call) => call.result === "denied");
					const turn = {
						id: uid("turn"),
						source,
						request: text,
						heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
						at: Date.now(),
						phase: waiting ? "awaiting" : denied ? "denied" : "done",
						step: 4,
						decision,
						approval: null,
						executed: remote.calls.some((call) => call.result === "executed"),
						showFindings: false,
						dryRun: remote.mode === "dry-run",
						exitCode: denied ? 1 : 0,
						durationMs: 0,
						hint: null,
						replies: [],
						toolRun: {
							assistant: remote.assistant,
							calls: remote.calls,
							mode: remote.mode
						},
						trace: null,
						serverCode: null
					};
					set({
						turns: [...get().turns, turn],
						auditEpoch: get().auditEpoch + 1
					});
					return;
				}
			} catch {}
			await get().ensureSession();
			const result = await postCommand(text, uid("req")).catch(() => null);
			const decision = result?.decision ?? unavailableDecision("Сервер политики не ответил.");
			const user = get().actorId;
			const next = {
				id: uid("turn"),
				source,
				request: text,
				heard: heard && heard.trim() && heard.trim() !== text ? heard.trim() : null,
				at: Date.now(),
				phase: result?.approval ? "awaiting" : decision.verdict === "deny" ? "denied" : "done",
				step: 4,
				decision,
				approval: result?.approval ? {
					id: result.approval.id,
					stage: result.approval.stage,
					expiresAt: result.approval.expiresAt,
					phrase: result.approval.phrase
				} : null,
				executed: Boolean(result?.executionCalled),
				showFindings: decision.verdict === "allow" && decision.findings.length > 0,
				dryRun: (result?.mode ?? "dry-run") !== "real",
				exitCode: decision.verdict === "allow" ? 0 : 1,
				durationMs: decision.durationMs,
				hint: decision.reason,
				replies: [],
				trace: result?.trace ?? null,
				serverCode: result?.code ?? "AUTH_REQUIRED"
			};
			set({
				turns: [...get().turns, next],
				serverMode: result?.mode ?? get().serverMode,
				audit: [auditFrom(next, user, result?.code ?? "deny", decision.reason, result?.approval?.id ?? null), ...get().audit].slice(0, 80)
			});
		} finally {
			lock = false;
			set({ busy: false });
		}
	}
}));
//#endregion
export { postVoiceHear as a, useJarvis as c, listToolAudit as i, WATCH_HOSTS as n, postVoiceSpeak as o, getToolStatus as r, postVoiceTurn as s, WATCH_ALERTS as t };
