import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";

export type PrWatchStatus = "pending" | "failed" | "passed" | "merged";

export type PrWatchState = {
  id: string;
  repository: string;
  pr: number;
  head: string;
  status: PrWatchStatus;
  polls: number;
  lastChecks: string[];
  createdAt: string;
  updatedAt: string;
};

function file(dir: string): string {
  return path.join(dir, "pr-watch.json");
}

function validWatch(value: unknown): value is PrWatchState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const watch = value as Partial<PrWatchState>;
  return (
    typeof watch.id === "string" &&
    /^[a-zA-Z0-9._:-]{1,80}$/.test(watch.id) &&
    typeof watch.repository === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(watch.repository) &&
    typeof watch.pr === "number" &&
    Number.isInteger(watch.pr) &&
    watch.pr >= 1 &&
    typeof watch.head === "string" &&
    /^[A-Fa-f0-9]{7,64}$/.test(watch.head) &&
    typeof watch.status === "string" &&
    ["pending", "failed", "passed", "merged"].includes(watch.status) &&
    typeof watch.polls === "number" &&
    Number.isInteger(watch.polls) &&
    watch.polls >= 0 &&
    Array.isArray(watch.lastChecks) &&
    watch.lastChecks.length <= 100 &&
    watch.lastChecks.every((item) => typeof item === "string" && item.length <= 300) &&
    typeof watch.createdAt === "string" &&
    Number.isFinite(Date.parse(watch.createdAt)) &&
    typeof watch.updatedAt === "string" &&
    Number.isFinite(Date.parse(watch.updatedAt))
  );
}

function load(dir: string): PrWatchState[] {
  const target=file(dir);
  if(!fs.existsSync(target)) return [];
  try{
    const parsed=JSON.parse(fs.readFileSync(target,"utf8")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(validWatch).map((watch) => ({ ...watch, lastChecks: [...watch.lastChecks] }))
      : [];
  }catch{return [];}
}

function save(dir:string,rows:PrWatchState[]):void{
  fs.mkdirSync(dir,{recursive:true});
  const target=file(dir),tmp=target+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(rows,null,2));
  fs.renameSync(tmp,target);
}

export function createPrWatch(input:{
  id:string; repository:string; pr:number; head:string; now?:Date;
}):PrWatchState|null{
  if(!/^[a-zA-Z0-9._:-]{1,80}$/.test(input.id)) return null;
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) return null;
  if(!Number.isInteger(input.pr)||input.pr<1) return null;
  if(!/^[A-Fa-f0-9]{7,64}$/.test(input.head)) return null;
  const at=(input.now??new Date()).toISOString();
  return {
    id:input.id,repository:input.repository,pr:input.pr,head:input.head,
    status:"pending",polls:0,lastChecks:[],createdAt:at,updatedAt:at,
  };
}

export function savePrWatch(dir:string,watch:PrWatchState):PrWatchState{
  return withStateLock(dir,()=>{
    const rows=load(dir);
    const index=rows.findIndex(row=>row.id===watch.id);
    if(index>=0) rows[index]=watch; else rows.push(watch);
    save(dir,rows);
    return {...watch,lastChecks:[...watch.lastChecks]};
  });
}

export function loadPrWatches(dir:string):PrWatchState[]{
  return load(dir).map(row=>({...row,lastChecks:[...row.lastChecks]}));
}

export function applyPrObservation(
  watch:PrWatchState,
  observation:{head:string; merged:boolean; checks:Array<{name:string; conclusion:"pending"|"success"|"failure"|"cancelled"|"skipped"}>},
  now=new Date(),
):PrWatchState{
  const headChanged=observation.head!==watch.head;
  const checks=observation.checks.map(item=>`${item.name}:${item.conclusion}`).slice(0,50);
  let status:PrWatchStatus="pending";
  if(observation.merged) status="merged";
  else if(headChanged) status="pending";
  else if(observation.checks.some(item=>item.conclusion==="failure"||item.conclusion==="cancelled")) status="failed";
  else if(observation.checks.length>0 && observation.checks.every(item=>item.conclusion==="success"||item.conclusion==="skipped")) status="passed";
  return {
    ...watch,
    head:observation.head,
    status,
    polls:watch.polls+1,
    lastChecks:checks,
    updatedAt:now.toISOString(),
  };
}

export function prWatchMayMutateRepository():false{return false;}
