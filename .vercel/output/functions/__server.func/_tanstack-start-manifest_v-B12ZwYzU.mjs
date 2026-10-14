//#region node_modules/.nitro/vite/services/ssr/assets/_tanstack-start-manifest_v-B12ZwYzU.js
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/workspace/jarvis-int/src/routes/__root.tsx",
		children: [
			"/",
			"/health",
			"/login",
			"/metrics",
			"/ready",
			"/status",
			"/admin/audit",
			"/api/agent",
			"/api/commands",
			"/api/local-auth",
			"/api/session",
			"/api/telegram",
			"/api/voice",
			"/api/auth/$"
		],
		preloads: ["/assets/index-D9vjOVbJ.js", "/assets/jsx-runtime-Dk72oS4N.js"],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-D9vjOVbJ.js"
		} }]
	},
	"/": {
		filePath: "/workspace/jarvis-int/src/routes/index.tsx",
		children: void 0,
		preloads: [
			"/assets/routes-BL6XrTBh.js",
			"/assets/store-BvriJHlc.js",
			"/assets/client-BeRV9Bd9.js"
		]
	},
	"/login": {
		filePath: "/workspace/jarvis-int/src/routes/login.tsx",
		children: void 0,
		preloads: ["/assets/login-_cwVefBu.js", "/assets/client-BeRV9Bd9.js"]
	},
	"/admin/audit": {
		filePath: "/workspace/jarvis-int/src/routes/admin.audit.tsx",
		children: void 0,
		preloads: ["/assets/admin.audit-BSxbrAr4.js", "/assets/store-BvriJHlc.js"]
	}
} });
//#endregion
export { tsrStartManifest };
