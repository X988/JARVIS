import { o as __toESM } from "../_runtime.mjs";
import { S as require_jsx_runtime, Y as require_react, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { c as useJarvis, i as listToolAudit } from "./store-B9Q3HqiX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin.audit-CLFgTolY.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function AuditAdminPage() {
	const operatorId = useJarvis((state) => state.operatorId);
	const auditEpoch = useJarvis((state) => state.auditEpoch);
	const [records, setRecords] = (0, import_react.useState)(null);
	const [forbidden, setForbidden] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		let cancel = false;
		setError(null);
		listToolAudit({ data: { operatorId } }).then((result) => {
			if (cancel) return;
			setForbidden(result.forbidden);
			setRecords(result.records);
		}).catch(() => {
			if (!cancel) setError("Журнал сейчас не прочитался.");
		});
		return () => {
			cancel = true;
		};
	}, [operatorId, auditEpoch]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-dvh bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "border-b border-line px-4 py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-moss",
					children: "admin"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold tracking-tight",
					children: "Журнал инструментов"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-xl text-pretty text-sm text-muted",
					children: "Каждый вызов: кто, что, когда и чем закончилось. Пароли и ключи в журнал не пишутся. Approve доступен только ролям operator и admin."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/",
					className: "mt-3 inline-flex min-h-11 items-center text-sm text-moss",
					children: "К консоли"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4",
			children: [
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-danger",
					children: error
				}) : null,
				forbidden ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-danger",
					children: "Этот оператор не допущен к журналу."
				}) : null,
				records === null && !error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Читаю журнал…"
				}) : null,
				records && records.length === 0 && !forbidden ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Пока нет вызовов. Команда в консоли оставит здесь строку."
				}) : null,
				records?.map((record) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "rounded-xl border border-line bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-baseline justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "font-mono text-xs text-moss",
								children: [
									record.result,
									" · ",
									record.mode
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", {
								className: "font-mono text-xs text-subtle",
								dateTime: record.at,
								children: record.at.replace("T", " ").replace(/\.\d{3}Z$/, "Z")
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 font-mono text-sm break-all text-paper",
							children: record.command
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 font-mono text-xs text-subtle",
							children: [
								record.actorName,
								" · ",
								record.role,
								" · ",
								record.tool,
								" · ",
								record.risk,
								" · ",
								record.host
							]
						}),
						record.approvalId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-xs text-warn",
							children: record.approvalId
						}) : null,
						record.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-pretty text-sm text-muted",
							children: record.detail
						}) : null
					]
				}, record.id))
			]
		})]
	});
}
//#endregion
export { AuditAdminPage as component };
