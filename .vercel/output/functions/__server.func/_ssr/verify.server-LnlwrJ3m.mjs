import { a as getRequest } from "./ssr.mjs";
import { D as authConfigured, E as auth, N as gateIdentityEnabled } from "./router-DHZGPzSw.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/verify.server-LnlwrJ3m.js
if (Boolean(process.env.DATABASE_URL?.trim()) && !authConfigured) console.error("[auth] DATABASE_URL is set but auth is disabled (VITE_AUTH_ENABLED=false) — requireUserId() will reject every request (fail closed) rather than share one dev user on a real database.");
/**
* Resolve the signed-in user from the current request, or `null` when auth isn't
* configured / nobody is signed in. Safe to call from server functions and SSR
* loaders.
*
* `bearerToken` is for the LIVE PREVIEW: the app runs in a partitioned iframe
* whose cookies don't reach the server, so `authMiddleware` forwards the session
* as a bearer token, which we present as `Authorization: Bearer …` (the `bearer`
* plugin resolves it). When deployed no token is passed and the cookie is used.
*/
async function getSessionUser(bearerToken) {
	if (!authConfigured && !gateIdentityEnabled()) return null;
	const request = getRequest();
	if (!request) return null;
	let headers = request.headers;
	if (bearerToken) {
		headers = new Headers(request.headers);
		headers.set("Authorization", `Bearer ${bearerToken}`);
	}
	const session = await auth.api.getSession({ headers });
	if (!session?.user) return null;
	return {
		id: session.user.id,
		email: session.user.email ?? null
	};
}
//#endregion
export { getSessionUser };
