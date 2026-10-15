import { randomUUID } from "node:crypto";
import { increment } from "../metrics.ts";
import { takeToken } from "../rate-limit.ts";
import { adapterStatus } from "./adapters.ts";
import { monitoringStatus } from "../monitoring.ts";
import { requestOriginAllowed } from "../../public-origin.ts";
import { authenticateRequest } from "./auth.ts";
import { canExecute, canRead, type Session } from "./session.ts";
import { processCommand } from "./pipeline.ts";
import { validRequestId } from "./idempotency.ts";
import { runHybridTurn } from "../plane/hybrid.ts";
import { listPendingApprovals } from "./approvals.ts";
import { diagnosticTool } from "../plane/diagnostics.ts";
import {
  cancelTaskJob,
  enqueueTask,
  listTasks,
  recordTaskEvidence,
  safeTaskReport,
} from "../plane/task-engine.ts";

function stateDir(): string {
  return process.env.JARVIS_STATE_DIR || process.cwd()+"/data";
}

function secure(request:Request):boolean{
  const proto=request.headers.get("x-forwarded-proto");
  if(proto) return proto.split(",")[0].trim()==="https";
  return new URL(request.url).protocol==="https:";
}

function readCookies(request:Request):Record<string,string>{
  const out=Object.create(null) as Record<string,string>;
  const header=request.headers.get("cookie");
  if(!header || header.length>8192) return out;
  for(const part of header.split(";")){
    const [name,...rest]=part.trim().split("=");
    if(!name || !/^[A-Za-z0-9_.-]{1,80}$/.test(name)) continue;
    try{
      out[name]=decodeURIComponent(rest.join("=")).slice(0,4096);
    }catch{
      continue;
    }
  }
  return out;
}

function csrfCookie(value:string,isSecure:boolean):string{
  return "jarvis_csrf="+encodeURIComponent(value)+"; Path=/; Max-Age=28800; SameSite=Strict"+(isSecure?"; Secure":"");
}

function json(body:unknown,code:number,cookies:string[]=[]):Response{
  const headers=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  for(const cookie of cookies) headers.append("set-cookie",cookie);
  return new Response(JSON.stringify(body),{status:code,headers});
}

export function executionMode():"dry-run"|"mock"|"real"{
  const raw=process.env.EXECUTION_MODE;
  return raw==="real" || raw==="mock" ? raw : "dry-run";
}

function httpStatus(code:string):number{
  if(code==="OK") return 200;
  if(code==="AUTH_REQUIRED") return 401;
  if(code==="ACTOR_DENIED" || code==="POLICY_DENIED") return 403;
  if(code==="APPROVAL_REQUIRED" || code==="MUTATION_REQUIRES_APPROVAL") return 202;
  if(code==="APPROVAL_EXPIRED" || code==="APPROVAL_MISMATCH" || code==="APPROVAL_CLOSED" || code==="PRECONDITION_FAILED") return 409;
  if(code==="APPROVAL_REJECTED") return 200;
  if(code==="TARGET_NOT_FOUND" || code==="RUNBOOK_NOT_FOUND") return 404;
  if(code==="SCHEMA_INVALID") return 400;
  if(code==="PLAN_INVALID" || code==="PLAN_REJECTED") return 422;
  if(code==="AGENT_DISABLED" || code==="LLM_UNAVAILABLE") return 503;
  if(code==="DRY_RUN" || code==="CLARIFY" || code==="AGENT_PARTIAL" || code==="INSUFFICIENT_EVIDENCE" || code==="AGENT_CANCELLED") return 200;
  if(code==="AGENT_TIMEOUT" || code==="LOCAL_ONLY") return 503;
  if(code==="EXECUTION_DISABLED" || code==="NOT_CONFIGURED" || code==="CREDENTIAL_UNAVAILABLE" || code==="ADAPTER_DISABLED" || code==="SECURITY_STATE_UNAVAILABLE" || code==="AUDIT_INTEGRITY") return 503;
  if(code==="EXECUTION_TIMEOUT" || code==="VERIFICATION_FAILED") return 504;
  return 403;
}

function csrfOk(request:Request,channel:string|null):boolean{
  if(channel==="telegram") return true;
  const cookies=readCookies(request);
  const cookie=cookies.jarvis_csrf;
  const header=request.headers.get("x-jarvis-csrf");
  if(!cookie || !header || cookie!==header) return false;
  const fetchSite=request.headers.get("sec-fetch-site");
  if(fetchSite==="cross-site") return false;
  if(!requestOriginAllowed(request)) return false;
  return true;
}

function newCsrf():string{
  return randomUUID().replace(/-/g,"");
}

/**
 * GET /api/audit: the server audit for admins only. 401 without a session,
 * 403 for a non-admin role (the reason names the role so a misconfigured
 * JARVIS_WEB_ACTORS_JSON binding is visible), 200 with the newest rows.
 */
export async function handleAuditList(request:Request):Promise<Response>{
  if(request.method!=="GET") return json({code:"SCHEMA_INVALID"},405);
  const auth=await authenticateRequest(request);
  if(!auth.session||auth.code!=="OK") return json({code:auth.code||"AUTH_REQUIRED",forbidden:true,records:[]},auth.code==="ACTOR_DENIED"?403:401);
  if(auth.session.role!=="admin") return json({code:"ACTOR_DENIED",forbidden:true,role:auth.session.role,reason:`роль ${auth.session.role}: журнал доступен только роли admin`,records:[]},403);
  const { readGatewayAudit } = await import("../tools/audit-reader.ts");
  try{
    const view=readGatewayAudit(auth.session,process.env.JARVIS_STATE_DIR||process.cwd()+"/data");
    return json({code:"OK",role:auth.session.role,...view},200);
  }catch(error){
    return json({code:String((error as Error)?.message??"AUDIT_UNAVAILABLE").slice(0,60),forbidden:false,records:[]},503);
  }
}

export async function handleSession(request:Request):Promise<Response>{
  if(request.method!=="GET") return json({code:"SCHEMA_INVALID"},405);
  const cookies=readCookies(request);
  const csrf=cookies.jarvis_csrf || newCsrf();
  const auth=await authenticateRequest(request);
  const heads=[csrfCookie(csrf,secure(request))];
  const identity=auth.userId ? {userId:auth.userId} : {};
  if(!auth.session) return json({code:auth.code,executionMode:executionMode(),monitoring:"MONITORING_NOT_CONFIGURED",...identity},httpStatus(auth.code),heads);
  return json({
    code:auth.code,
    actorId:auth.session.accountId,
    role:auth.session.role,
    channel:auth.channel,
    executionMode:executionMode(),
    profile:process.env.JARVIS_PROFILE==="production-infra"?"production-infra":"demo",
    adapters:adapterStatus(),
    monitoring: monitoringStatus(),
    ...identity,
  },auth.code==="OK"?200:403,heads);
}

export async function handleCommand(request:Request):Promise<Response>{
  if(request.method!=="POST") return json({code:"SCHEMA_INVALID",verdict:"deny"},405);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  }
  const auth=await authenticateRequest(request);
  if(!auth.session || auth.code!=="OK") return json({code:auth.code,verdict:"deny"},httpStatus(auth.code));
  if(!csrfOk(request,auth.channel)) return json({code:"AUTH_REQUIRED",verdict:"deny"},401);
  let rateAllowed=false;
  try{
    rateAllowed=takeToken("cmd:"+auth.session.accountId,30,60_000);
  }catch{
    increment("jarvis_rate_limit_denied_total");
    return json({code:"SECURITY_STATE_UNAVAILABLE",verdict:"deny"},503);
  }
  if(!rateAllowed){
    increment("jarvis_rate_limit_denied_total");
    return json({code:"RATE_LIMIT",verdict:"deny"},429);
  }
  const contentLength=Number(request.headers.get("content-length") ?? "0");
  if(Number.isFinite(contentLength) && contentLength>64*1024){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},413);
  }
  let parsedBody:unknown;
  try{ parsedBody=await request.json(); }
  catch{ return json({code:"SCHEMA_INVALID",verdict:"deny"},400); }
  if(!parsedBody || typeof parsedBody!=="object" || Array.isArray(parsedBody)){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  }
  const body=parsedBody as Record<string,unknown>;
  if(typeof body.text!=="string" || !body.text.trim() || body.text.length>4000){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  }

  // Security-sensitive values are deliberately ignored. They are accepted only
  // so older/future clients cannot accidentally become an authority.
  const forged:Record<string,unknown>={};
  for(const key of ["risk","policy","role","allowed","runbook","approved","executor","approvalStatus","parameters","operatorId","actorId"]){
    if(key in body) forged[key]=body[key];
  }
  if(body.decision!==undefined && body.decision!=="confirm" && body.decision!=="reject"){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  }
  const requestIdRaw=typeof body.request_id==="string" ? body.request_id : typeof body.requestId==="string" ? body.requestId : "";
  const requestId=requestIdRaw ? requestIdRaw.trim() : randomUUID();
  if(!validRequestId(requestId)) return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  const approvalId=typeof body.approval_id==="string" ? body.approval_id.trim() : "";
  const confirmation=typeof body.confirmation==="string" ? body.confirmation.trim() : "";
  if(
    (approvalId && !/^APPROVAL-[A-Z0-9-]{8,80}$/.test(approvalId)) ||
    confirmation.length>160
  ){
    return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  }
  const decision=body.decision==="reject" ? "reject" as const : "confirm" as const;
  const approval=decision==="reject"
    ? (approvalId ? {id:approvalId,confirmation:confirmation || "REJECT",decision} : undefined)
    : (approvalId && confirmation ? {id:approvalId,confirmation,decision} : undefined);
  if(decision==="reject" && !approval) return json({code:"SCHEMA_INVALID",verdict:"deny"},400);
  const result=processCommand({
    text:body.text,
    requestId,
    session:auth.session,
    stateDir:stateDir(),
    forged,
    approval,
    channel:auth.channel ?? "web",
  });
  return json(result,httpStatus(result.code));
}


export async function handleAgentCommand(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ code: "SCHEMA_INVALID" }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }

  const auth = await authenticateRequest(request);
  if (!auth.session || auth.code !== "OK") {
    return json({ code: auth.code }, httpStatus(auth.code));
  }
  if (!csrfOk(request, auth.channel)) return json({ code: "AUTH_REQUIRED" }, 401);

  let rateAllowed = false;
  try {
    rateAllowed = takeToken("agent:" + auth.session.accountId, 12, 60_000);
  } catch {
    increment("jarvis_rate_limit_denied_total");
    return json({ code: "SECURITY_STATE_UNAVAILABLE" }, 503);
  }
  if (!rateAllowed) {
    increment("jarvis_rate_limit_denied_total");
    return json({ code: "RATE_LIMIT" }, 429);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return json({ code: "SCHEMA_INVALID" }, 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  const body = parsedBody as Record<string, unknown>;
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }

  const requestIdRaw =
    typeof body.request_id === "string"
      ? body.request_id
      : typeof body.requestId === "string"
        ? body.requestId
        : "";
  const requestId = requestIdRaw ? requestIdRaw.trim() : randomUUID();
  if (!validRequestId(requestId)) return json({ code: "SCHEMA_INVALID" }, 400);

  const result = await runHybridTurn(body.text, {
    session: auth.session,
    stateDir: stateDir(),
    requestId,
    mode: executionMode(),
  });
  return json(result, httpStatus(result.code));
}

export async function handleTasks(request: Request): Promise<Response> {
  const dir = stateDir();
  if (request.method === "GET") {
    const auth = await authenticateRequest(request);
    if (!auth.session || auth.code !== "OK") return json({ code: auth.code, tasks: [], approvals: [] }, httpStatus(auth.code));
    if (!canRead(auth.session.role)) return json({ code: "ACTOR_DENIED", tasks: [], approvals: [] }, 403);
    return json({
      code: "OK",
      tasks: listTasks(dir, auth.session.accountId, auth.session.role),
      approvals: listPendingApprovals(dir, auth.session.accountId, auth.session.role),
    }, 200);
  }
  if (request.method !== "POST") return json({ code: "SCHEMA_INVALID" }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  const guard = await guardWebPost(request, "tasks", 20);
  if (!guard.ok) return guard.response;
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ code: "SCHEMA_INVALID" }, 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ code: "SCHEMA_INVALID" }, 400);
  const body = parsed as Record<string, unknown>;
  const action = body.action;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (action === "cancel") {
    if (!/^[A-Za-z0-9._:-]{1,96}$/.test(id)) return json({ code: "SCHEMA_INVALID" }, 400);
    const job = cancelTaskJob(dir, id, guard.session.accountId, guard.session.role);
    return json({ code: job ? "OK" : "ACTOR_DENIED", id }, job ? 200 : 403);
  }
  if (action === "report") {
    if (!/^[A-Za-z0-9._:-]{1,96}$/.test(id)) return json({ code: "SCHEMA_INVALID" }, 400);
    const view = listTasks(dir, guard.session.accountId, guard.session.role).find((item) => item.id === id);
    if (!view) return json({ code: "TARGET_NOT_FOUND" }, 404);
    return json({ code: "OK", report: safeTaskReport(view) }, 200);
  }
  if (action === "rerun") {
    if (!/^[A-Za-z0-9._:-]{1,96}$/.test(id)) return json({ code: "SCHEMA_INVALID" }, 400);
    const view = listTasks(dir, guard.session.accountId, guard.session.role).find((item) => item.id === id);
    if (!view) return json({ code: "TARGET_NOT_FOUND" }, 404);
    const allowed = view.tools.length > 0 && view.tools.every((tool) => diagnosticTool(tool)?.risk === "read");
    if (!allowed) return json({ code: "POLICY_DENIED" }, 403);
    const nextId = `rerun-${id}`.slice(0, 96);
    const job = enqueueTask(dir, {
      id: nextId,
      ownerId: guard.session.accountId,
      idempotent: true,
      dangerous: false,
    });
    for (const tool of view.tools) recordTaskEvidence(dir, job.id, { tool });
    recordTaskEvidence(dir, job.id, {
      model: view.model ?? undefined,
      conclusion: "Повтор разрешённой диагностики поставлен в очередь. Live-проба из браузера не запускалась.",
    });
    return json({ code: "OK", id: job.id }, 200);
  }
  if (action === "enqueue") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 500) return json({ code: "SCHEMA_INVALID" }, 400);
    const job = enqueueTask(dir, {
      id: `task-${randomUUID()}`,
      ownerId: guard.session.accountId,
      idempotent: true,
      dangerous: false,
    });
    recordTaskEvidence(dir, job.id, {
      conclusion: "Запрос принят в очередь. Исполнение остаётся за worker и Execution Gateway.",
    });
    return json({ code: "OK", id: job.id }, 200);
  }
  return json({ code: "SCHEMA_INVALID" }, 400);
}

export async function guardWebPost(
  request: Request,
  bucket: string,
  limit: number,
): Promise<{ ok: true; session: Session } | { ok: false; response: Response }> {
  const auth = await authenticateRequest(request);
  if (!auth.session || auth.code !== "OK") {
    return { ok: false, response: json({ code: auth.code }, httpStatus(auth.code)) };
  }
  if (!canExecute(auth.session.role)) {
    return { ok: false, response: json({ code: "ACTOR_DENIED" }, 403) };
  }
  if (!csrfOk(request, auth.channel)) return { ok: false, response: json({ code: "AUTH_REQUIRED" }, 401) };
  let rateAllowed = false;
  try {
    rateAllowed = takeToken(bucket + ":" + auth.session.accountId, limit, 60_000);
  } catch {
    increment("jarvis_rate_limit_denied_total");
    return { ok: false, response: json({ code: "SECURITY_STATE_UNAVAILABLE" }, 503) };
  }
  if (!rateAllowed) {
    increment("jarvis_rate_limit_denied_total");
    return { ok: false, response: json({ code: "RATE_LIMIT" }, 429) };
  }
  return { ok: true, session: auth.session };
}
