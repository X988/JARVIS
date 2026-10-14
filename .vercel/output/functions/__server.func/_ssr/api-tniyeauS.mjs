import { n as createServerFn, r as TSS_SERVER_FUNCTION } from "./ssr.mjs";
import { H as string, j as _enum, z as object } from "../_libs/@better-auth/core+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/api-tniyeauS.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
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
var getToolStatus_createServerFn_handler = createServerRpc({
	id: "66e6294edd257c54b492c5bb5b3fd36422e980a3cfeb232c8d906825411cf2ba",
	name: "getToolStatus",
	filename: "src/lib/jarvis/tools/api.ts"
}, (opts) => getToolStatus.__executeServer(opts));
var getToolStatus = createServerFn({ method: "GET" }).handler(getToolStatus_createServerFn_handler, async () => {
	const { handleStatus } = await import("./runtime.server-owvRTmIj.mjs");
	return handleStatus();
});
var runAssistantTurn_createServerFn_handler = createServerRpc({
	id: "03e9f5687141a7598029dc49219cd0bdbf23b7a55d2307a733a9cc1c7637e519",
	name: "runAssistantTurn",
	filename: "src/lib/jarvis/tools/api.ts"
}, (opts) => runAssistantTurn.__executeServer(opts));
var runAssistantTurn = createServerFn({ method: "POST" }).validator((data) => RunInput.parse(data)).handler(runAssistantTurn_createServerFn_handler, async ({ data }) => {
	const { handleRunTurn } = await import("./runtime.server-owvRTmIj.mjs");
	return handleRunTurn(data);
});
var decideToolApproval_createServerFn_handler = createServerRpc({
	id: "d249e7c0fb4d0d241796fe99c68a8d9a7942ba607fc4d3d78f6895caf1ba99f9",
	name: "decideToolApproval",
	filename: "src/lib/jarvis/tools/api.ts"
}, (opts) => decideToolApproval.__executeServer(opts));
var decideToolApproval = createServerFn({ method: "POST" }).validator((data) => DecideInput.parse(data)).handler(decideToolApproval_createServerFn_handler, async ({ data }) => {
	const { handleDecide } = await import("./runtime.server-owvRTmIj.mjs");
	return handleDecide(data);
});
var listToolAudit_createServerFn_handler = createServerRpc({
	id: "05c40de878a708fedf7b5c5e1af64ed2854b1161fe1390c5ec85fe2e162b8cef",
	name: "listToolAudit",
	filename: "src/lib/jarvis/tools/api.ts"
}, (opts) => listToolAudit.__executeServer(opts));
var listToolAudit = createServerFn({ method: "POST" }).validator((data) => AuditInput.parse(data)).handler(listToolAudit_createServerFn_handler, async ({ data }) => {
	const { handleListAudit } = await import("./runtime.server-owvRTmIj.mjs");
	return handleListAudit(data.operatorId);
});
//#endregion
export { decideToolApproval_createServerFn_handler, getToolStatus_createServerFn_handler, listToolAudit_createServerFn_handler, runAssistantTurn_createServerFn_handler };
