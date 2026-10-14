import { timingSafeEqual } from "node:crypto";
import { bindWebUser } from "../web-actor.ts";
import { allowTestAuth, canRead, isJarvisRole, roleForTestActor, type JarvisRole, type Session } from "./session.ts";

type WebBinding={actorId:string;role:JarvisRole};
type TelegramBinding={actorId:string;role:JarvisRole};

export type AuthResult={session:Session|null;code:"OK"|"AUTH_REQUIRED"|"ACTOR_DENIED";channel:"web"|"telegram"|"test"|null;userId?:string};

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

function usableBinding(value: unknown): WebBinding | TelegramBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { actorId?: unknown; role?: unknown };
  if (typeof row.actorId !== "string" || !row.actorId.trim()) return null;
  if (typeof row.role !== "string" || !isJarvisRole(row.role)) return null;
  return { actorId: row.actorId, role: row.role };
}

function authCode(role: JarvisRole): "OK" | "ACTOR_DENIED" {
  return canRead(role) ? "OK" : "ACTOR_DENIED";
}

export async function authenticateRequest(request:Request):Promise<AuthResult>{
  if(allowTestAuth()){
    const actor=request.headers.get("x-jarvis-test-actor")?.trim();
    if(!actor) return {session:null,code:"AUTH_REQUIRED",channel:"test"};
    if(request.headers.get("x-jarvis-test-expired")==="1"){
      return {session:null,code:"AUTH_REQUIRED",channel:"test"};
    }
    const role=roleForTestActor(actor);
    const session=makeSession("test-"+actor,{actorId:actor,role},"test");
    if(session.expiresAt<=Date.now()) return {session:null,code:"AUTH_REQUIRED",channel:"test"};
    return {session,code:authCode(role),channel:"test"};
  }

  const telegramId=request.headers.get("x-telegram-id")?.trim();
  if(telegramId){
    const supplied=request.headers.get("x-jarvis-telegram-secret") ?? "";
    const expected=process.env.JARVIS_TELEGRAM_WEBHOOK_SECRET ?? "";
    if(!expected || !sameSecret(supplied,expected)) return {session:null,code:"AUTH_REQUIRED",channel:"telegram"};
    const binding=usableBinding(jsonMap<TelegramBinding>("JARVIS_TELEGRAM_ACTORS_JSON")[telegramId]);
    if(!binding) return {session:null,code:"ACTOR_DENIED",channel:"telegram"};
    const session=makeSession("telegram-"+telegramId,binding,"telegram");
    if(session.expiresAt<=Date.now()) return {session:null,code:"AUTH_REQUIRED",channel:"telegram"};
    return {session,code:authCode(binding.role),channel:"telegram"};
  }

  let user: { id: string } | null = null;
  try {
    const { getSessionUser } = await import("../../auth/verify.server.ts");
    user = await getSessionUser();
  } catch {
    return { session: null, code: "AUTH_REQUIRED", channel: "web" };
  }
  if(!user) return {session:null,code:"AUTH_REQUIRED",channel:"web"};
  const resolved=bindWebUser(user.id);
  if(!resolved.binding) return {session:null,code:"ACTOR_DENIED",channel:"web",userId:user.id};
  const session=makeSession("web-"+user.id,resolved.binding,"web");
  if(session.expiresAt<=Date.now()) return {session:null,code:"AUTH_REQUIRED",channel:"web",userId:user.id};
  return {session,code:resolved.code,channel:"web",userId:user.id};
}
