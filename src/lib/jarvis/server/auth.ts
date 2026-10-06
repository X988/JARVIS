import { timingSafeEqual } from "node:crypto";
import type { Session } from "./session.ts";

type Role="operator"|"none";
type WebBinding={actorId:string;role:Role};
type TelegramBinding={actorId:string;role:Role};

export type AuthResult={session:Session|null;code:"OK"|"AUTH_REQUIRED"|"ACTOR_DENIED";channel:"web"|"telegram"|"test"|null};

function jsonMap<T>(name:string):Record<string,T>{
  const raw=process.env[name]?.trim();
  if(!raw) return {};
  try{
    const parsed=JSON.parse(raw) as unknown;
    return parsed && typeof parsed==="object" && !Array.isArray(parsed) ? parsed as Record<string,T> : {};
  }catch{
    return {};
  }
}

function sameSecret(left:string,right:string):boolean{
  const a=Buffer.from(left);
  const b=Buffer.from(right);
  return a.length===b.length && timingSafeEqual(a,b);
}

function makeSession(id:string,binding:WebBinding|TelegramBinding,channel:Session["channel"]):Session{
  return {id,accountId:binding.actorId,role:binding.role,expiresAt:Date.now()+8*60*60_000,channel};
}

export async function authenticateRequest(request:Request):Promise<AuthResult>{
  if(process.env.NODE_ENV!=="production" && process.env.JARVIS_TEST_AUTH==="1"){
    const actor=request.headers.get("x-jarvis-test-actor")?.trim();
    if(!actor) return {session:null,code:"AUTH_REQUIRED",channel:"test"};
    const role:Role=actor==="admin1" ? "operator" : "none";
    return {session:makeSession("test-"+actor,{actorId:actor,role},"test"),code:role==="operator"?"OK":"ACTOR_DENIED",channel:"test"};
  }

  const telegramId=request.headers.get("x-telegram-id")?.trim();
  if(telegramId){
    const supplied=request.headers.get("x-jarvis-telegram-secret") ?? "";
    const expected=process.env.JARVIS_TELEGRAM_WEBHOOK_SECRET ?? "";
    if(!expected || !sameSecret(supplied,expected)) return {session:null,code:"AUTH_REQUIRED",channel:"telegram"};
    const binding=jsonMap<TelegramBinding>("JARVIS_TELEGRAM_ACTORS_JSON")[telegramId];
    if(!binding) return {session:null,code:"ACTOR_DENIED",channel:"telegram"};
    return {session:makeSession("telegram-"+telegramId,binding,"telegram"),code:binding.role==="operator"?"OK":"ACTOR_DENIED",channel:"telegram"};
  }

  const { getSessionUser } = await import("../../auth/verify.server.ts");
  const user=await getSessionUser();
  if(!user) return {session:null,code:"AUTH_REQUIRED",channel:"web"};
  const bindings=jsonMap<WebBinding>("JARVIS_WEB_ACTORS_JSON");
  let binding=bindings[user.id];
  if(!binding && process.env.NODE_ENV!=="production" && process.env.JARVIS_ALLOW_ANY_AUTHENTICATED_DEV==="1"){
    binding={actorId:user.id,role:"operator"};
  }
  if(!binding) return {session:null,code:"ACTOR_DENIED",channel:"web"};
  return {session:makeSession("web-"+user.id,binding,"web"),code:binding.role==="operator"?"OK":"ACTOR_DENIED",channel:"web"};
}
