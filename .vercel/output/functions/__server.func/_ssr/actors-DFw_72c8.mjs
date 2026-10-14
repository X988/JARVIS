//#region node_modules/.nitro/vite/services/ssr/assets/actors-DFw_72c8.js
var DEMO_ACTORS = [
	{
		id: "admin1",
		name: "admin1",
		role: "admin",
		allowed: true,
		telegramId: 100842
	},
	{
		id: "operator1",
		name: "operator1",
		role: "operator",
		allowed: true,
		telegramId: 100900
	},
	{
		id: "viewer1",
		name: "viewer",
		role: "viewer",
		allowed: true,
		telegramId: 100901
	},
	{
		id: "stranger",
		name: "чужой аккаунт",
		role: "viewer",
		allowed: false,
		telegramId: 0
	}
];
function canApprove(role) {
	return role === "admin" || role === "operator";
}
function parseOperators(raw) {
	if (!raw?.trim()) return null;
	const actors = [];
	for (const part of raw.split(",")) {
		const [id, role, name, telegram] = part.split(":").map((item) => item.trim());
		if (!id || !name) continue;
		if (role !== "admin" && role !== "operator" && role !== "viewer") continue;
		const telegramId = Number(telegram ?? "0");
		actors.push({
			id,
			name,
			role,
			allowed: true,
			telegramId: Number.isFinite(telegramId) ? telegramId : 0
		});
	}
	return actors.length > 0 ? actors : null;
}
function resolveActor(id, operators) {
	return (operators ?? DEMO_ACTORS).find((actor) => actor.id === id) ?? null;
}
//#endregion
export { resolveActor as i, canApprove as n, parseOperators as r, DEMO_ACTORS as t };
