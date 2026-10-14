import { z } from "zod";
import path from "node:path";
import { adapterStatus } from "./adapters.ts";
import { probeViews } from "./probe-status.ts";

const DEPRECATED: Record<string, string> = {
  JARVIS_MAILCOW_COMPOSE_FILE: "JARVIS_MAILCOW_COMPOSE",
  JARVIS_AUDIT_HTTP: "JARVIS_AUDIT_HTTP_URL",
  JARVIS_SQL_BACKUP_DESTINATION: "JARVIS_SQL_BACKUP_DIR",
  JARVIS_TELEGRAM_IDS: "JARVIS_TELEGRAM_ACTORS_JSON",
  JARVIS_ROUTEROS_USER: "JARVIS_MIKROTIK_USER",
};
const ENABLED_NEEDS_HOST: Array<[string,string]>=[["JARVIS_SQL_ENABLED","JARVIS_SQL_HOST"],["JARVIS_DOCKER_ENABLED","JARVIS_DOCKER_HOST"]];
const actorSchema=z.object({actorId:z.string().min(1),role:z.enum(["operator","none"])});
const hostMapSchema=z.record(z.string().min(1),z.string().regex(/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/));
export type JarvisProblems=string[];
function enabled(value:string|undefined):boolean{return value==="1"||value==="true";}
function safeJson(raw:string):unknown{try{return JSON.parse(raw);}catch{return null;}}
function validHostMap(raw:string|undefined):boolean{return Boolean(raw?.trim())&&hostMapSchema.safeParse(safeJson(raw!)).success;}

export function configProblems(env:NodeJS.ProcessEnv=process.env):JarvisProblems{
 const problems:string[]=[];
 for(const [oldName,nextName] of Object.entries(DEPRECATED)) if(env[oldName]?.trim()) problems.push(`${oldName} устарело. Задайте ${nextName}. Старое имя не читается.`);
 for(const [flag,host] of ENABLED_NEEDS_HOST) if(enabled(env[flag])&&!env[host]?.trim()) problems.push(`${flag} включён, а ${host} пуст.`);
 if(env.JARVIS_WINDOWS_TARGETS_JSON?.trim()&&!validHostMap(env.JARVIS_WINDOWS_TARGETS_JSON)) problems.push("JARVIS_WINDOWS_TARGETS_JSON должен быть картой target id → hostname.");
 if(env.JARVIS_SSH_TARGETS_JSON?.trim()&&!validHostMap(env.JARVIS_SSH_TARGETS_JSON)) problems.push("JARVIS_SSH_TARGETS_JSON должен быть картой target id → hostname.");
 if(enabled(env.JARVIS_POWERSHELL_ENABLED)){
  if(!env.JARVIS_WINDOWS_HOST?.trim()&&!validHostMap(env.JARVIS_WINDOWS_TARGETS_JSON)) problems.push("JARVIS_POWERSHELL_ENABLED включён, но не задан JARVIS_WINDOWS_TARGETS_JSON или fallback JARVIS_WINDOWS_HOST.");
  if(!env.JARVIS_WINDOWS_USER?.trim()) problems.push("JARVIS_WINDOWS_USER не задан.");
  if(!env.JARVIS_WINDOWS_PASSWORD) problems.push("JARVIS_WINDOWS_PASSWORD не задан.");
 }
 if(enabled(env.JARVIS_SSH_ENABLED)){
  if(!env.JARVIS_SSH_HOST?.trim()&&!validHostMap(env.JARVIS_SSH_TARGETS_JSON)) problems.push("JARVIS_SSH_ENABLED включён, но не задан JARVIS_SSH_TARGETS_JSON или fallback JARVIS_SSH_HOST.");
  if(!env.JARVIS_SSH_USER?.trim()) problems.push("JARVIS_SSH_USER не задан.");
 }
 if(enabled(env.JARVIS_ROUTEROS_ENABLED)){
  if(!env.JARVIS_MIKROTIK_HOST?.trim()) problems.push("JARVIS_MIKROTIK_HOST не задан.");
  if(!env.JARVIS_MIKROTIK_USER?.trim()) problems.push("JARVIS_MIKROTIK_USER не задан.");
  if(!env.JARVIS_MIKROTIK_PASSWORD) problems.push("JARVIS_MIKROTIK_PASSWORD не задан.");
 }
 if(enabled(env.JARVIS_DOCKER_ENABLED)){
  if(!env.JARVIS_DOCKER_USER?.trim()&&!env.JARVIS_SSH_USER?.trim()) problems.push("JARVIS_DOCKER_USER или JARVIS_SSH_USER не задан.");
  if(!env.JARVIS_MAILCOW_COMPOSE?.startsWith("/")) problems.push("JARVIS_MAILCOW_COMPOSE должен быть абсолютным Linux-путём.");
 }
 const raw=env.JARVIS_TELEGRAM_ACTORS_JSON?.trim();
 if(raw){const parsed=z.record(z.string().regex(/^[1-9]\d*$/),actorSchema).safeParse(safeJson(raw));if(!parsed.success) problems.push("JARVIS_TELEGRAM_ACTORS_JSON не является картой числовой id → {actorId, role}.");}
 if(env.EXECUTION_MODE&&![ "mock","dry-run","real"].includes(env.EXECUTION_MODE)) problems.push("EXECUTION_MODE должен быть mock, dry-run или real.");
 const profile=env.JARVIS_PROFILE?.trim();if(profile&&profile!=="demo"&&profile!=="production-infra") problems.push("JARVIS_PROFILE должен быть demo или production-infra.");
 return problems;
}

export function readiness(
 env:NodeJS.ProcessEnv=process.env,
 opts:{dumpPresent?:boolean;stateDir?:string;now?:number}={},
):{
 ok:boolean;
 profile:"demo"|"production-infra";
 problems:string[];
 adapters:Record<string,string>;
 probes:ReturnType<typeof probeViews>;
}{
 const problems=configProblems(env);
 const profile=env.JARVIS_PROFILE==="production-infra"?"production-infra":"demo";
 const adapters=adapterStatus(env);
 const stateDir=path.resolve(opts.stateDir||env.JARVIS_STATE_DIR||path.join(process.cwd(),"data"));
 const rawTtl=Number(env.JARVIS_ADAPTER_PROBE_TTL_MS??120_000);
 const ttlMs=Number.isFinite(rawTtl)?Math.max(5_000,Math.min(30*60_000,Math.trunc(rawTtl))):120_000;
 const probes=probeViews(adapters,stateDir,opts.now??Date.now(),ttlMs);
 if(profile==="demo") return {ok:problems.length===0&&opts.dumpPresent!==false,profile,problems,adapters,probes};
 const required=["powershell","ssh","sql"] as const;
 const liveReady=required.every(name=>probes[name]?.status==="HEALTHY");
 return {ok:problems.length===0&&liveReady,profile,problems,adapters,probes};
}
