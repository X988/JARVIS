import { randomUUID } from "node:crypto";
import { takeToken } from "../rate-limit.ts";
import { adapterStatus } from "./adapters.ts";
import { monitoringStatus } from "../monitoring.ts";
import { authenticateRequest } from "./auth.ts";
import { processCommand } from "./pipeline.ts";
import { validRequestId } from "./idempotency.ts";

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
  if(code==="APPROVAL_REQUIRED") return 202;
  if(code==="APPROVAL_EXPIRED" || code==="APPROVAL_MISMATCH" || code==="PRECONDITION_FAILED") return 409;
  if(code==="TARGET_NOT_FOUND" || code==="RUNBOOK_NOT_FOUND") return 404;
  if(code==="SCHEMA_INVALID") return 400;
  if(code==="EXECUTION_DISABLED" || code==="NOT_CONFIGURED" || code==="CREDENTIAL_UNAVAILABLE" || code==="ADAPTER_DISABLED") return 503;
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
  const origin=request.headers.get("origin");
  if(origin){
    try{
      if(new URL(origin).host!==new URL(request.url).host) return false;
    }catch{return false;}
  }
  return true;
}

function newCsrf():string{
  return randomUUID().replace(/-/g,"");
}

export async function handleSession(request:Request):Promise<Response>{
  if(request.method!=="GET") return json({code:"SCHEMA_INVALID"},405);
  const cookies=readCookies(request);
  const csrf=cookies.jarvis_csrf || newCsrf();
  const auth=await authenticateRequest(request);
  const heads=[csrfCookie(csrf,secure(request))];
  if(!auth.session) return json({code:auth.code,executionMode:executionMode(),monitoring:"MONITORING_NOT_CONFIGURED"},httpStatus(auth.code),heads);
  return json({
    code:auth.code,
    actorId:auth.session.accountId,
    role:auth.session.role,
    channel:auth.channel,
    executionMode:executionMode(),
    adapters:adapterStatus(),
    monitoring: monitoringStatus(),
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
  if(!takeToken("cmd:"+auth.session.accountId,30,60_000)) return json({code:"RATE_LIMIT",verdict:"deny"},429);
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
  for(const key of ["risk","policy","role","allowed","runbook","approved","executor","approvalStatus","parameters"]){
    if(key in body) forged[key]=body[key];
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
  const approval=approvalId && confirmation ? {id:approvalId,confirmation} : undefined;
  const result=processCommand({
    text:body.text,
    requestId,
    session:auth.session,
    stateDir:stateDir(),
    forged,
    approval,
  });
  return json(result,httpStatus(result.code));
}
