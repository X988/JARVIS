import { getRequest } from "@tanstack/react-start/server";
import { authenticateRequest } from "../server/auth.ts";
import { readGatewayAudit } from "./audit-reader.ts";

// The legacy direct-execution engine is intentionally not instantiated here.
// A client-selected operator never becomes execution or audit authority.
export async function handleListAudit() {
  const request = getRequest();
  if (!request) return { forbidden: true, records: [] };
  const auth = await authenticateRequest(request);
  if (auth.code !== "OK") return { forbidden: true, records: [] };
  return readGatewayAudit(auth.session, process.env.JARVIS_STATE_DIR || process.cwd() + "/data");
}
