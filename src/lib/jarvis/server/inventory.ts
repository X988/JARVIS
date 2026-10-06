import fs from "node:fs";
import path from "node:path";

export type Target = {
  id: string;
  displayName: string;
  type: "host" | "database" | "router" | "mail" | "vpn" | "repo" | "fleet";
  environment: "production" | "test" | "development";
  roles: string[];
  reference: string;
  aliases: string[];
  enabled: boolean;
  allowedRunbooks: string[];
};

type InventoryFile={version:number;targets:Target[]};

function loadInventory(file=path.join(process.cwd(),"config","jarvis","inventory.json")):Target[]{
  const parsed=JSON.parse(fs.readFileSync(file,"utf8")) as InventoryFile;
  if(!parsed.version || !Array.isArray(parsed.targets)) throw new Error("Invalid JARVIS inventory");
  const ids=new Set<string>();
  for(const target of parsed.targets){
    if(!target.id || ids.has(target.id)) throw new Error("Duplicate/invalid inventory target: "+target.id);
    ids.add(target.id);
  }
  return parsed.targets.filter((target)=>target.enabled);
}

export const INVENTORY:Target[]=loadInventory();

const STOP=new Set(["main","master","confirm","approval","backup","docker","github","http","https","bsl","cf","dry","run","check","server","health","status"]);

function escapeRegex(value:string):string{return value.replace(/[.*+?^$(){}|[\]\\]/g,"\\$&");}

export function targetById(id:string):Target|null{
  return INVENTORY.find((item)=>item.id===id) ?? null;
}

export function matchTarget(text:string):Target|null{
  const folded=text.toLocaleLowerCase("ru-RU").replace(/ё/g,"е");
  const ranked=INVENTORY.flatMap((item)=>[item.id,item.displayName,...item.aliases].map((alias)=>({item,alias:alias.toLocaleLowerCase("ru-RU").replace(/ё/g,"е")})));
  ranked.sort((a,b)=>b.alias.length-a.alias.length);
  for(const row of ranked){
    const pattern=new RegExp("(?:^|[^\\p{L}\\p{N}_])"+escapeRegex(row.alias)+"(?:$|[^\\p{L}\\p{N}_])","iu");
    if(pattern.test(" "+folded+" ")) return row.item;
  }
  return null;
}

export function unknownLatinToken(text:string):string|null{
  const tokens=text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) ?? [];
  const known=new Set<string>(STOP);
  for(const item of INVENTORY){
    known.add(item.id.toLowerCase());
    for(const alias of item.aliases){
      for(const token of alias.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) ?? []) known.add(token);
    }
  }
  for(const token of tokens){
    if(known.has(token)||token.startsWith("approval-")) continue;
    return token;
  }
  return null;
}
