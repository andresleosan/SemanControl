import "server-only";
import type { Principal } from "../auth/types";
import { ApiError } from "../security/errors";
import { uuid } from "../api";

export function stable(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value)??"null";
}
export async function hash(value:unknown):Promise<string>{const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(typeof value==="string"?value:stable(value)));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");}
export class Batch {
  statements:D1PreparedStatement[]=[];guards:string[]=[];
  constructor(public db:D1Database){}
  add(sql:string,...params:unknown[]){this.statements.push(this.db.prepare(sql).bind(...params));}
  guard(condition:string,...params:unknown[]){const id=crypto.randomUUID();this.guards.push(id);this.add(`INSERT INTO operation_guards(id,ok) VALUES(?,CASE WHEN (${condition}) THEN 1 ELSE 0 END)`,id,...params);}
  changed(){this.guard("changes()=1");}
  finish(){for(const id of this.guards)this.add("DELETE FROM operation_guards WHERE id=?",id);return this.statements;}
  audit(p:Principal,action:string,id:string,reason:string,previous:unknown,next:unknown){this.add("INSERT INTO audit_events(id,actor_id,action,entity_id,reason,previous_json,next_json) VALUES(?,?,?,?,?,?,?)",crypto.randomUUID(),p.userId,action,id,reason,JSON.stringify(previous),JSON.stringify(next));}
}
export async function mutation<T>(db:D1Database,p:Principal,action:string,payload:unknown,key:unknown,result:T,build:(batch:Batch)=>Promise<void>|void):Promise<T>{
  if(p.role!=="ADMIN")throw new ApiError(403,"ROLE_FORBIDDEN","Esta operación requiere administrador.");
  const operationKey=key===undefined?null:uuid(key);const digest=await hash({action,payload});
  async function replay():Promise<T|undefined>{
    if(!operationKey)return undefined;
    const row=await db.prepare("SELECT actor_id,payload_hash,result_json FROM operation_requests WHERE idempotency_key=?").bind(operationKey).first<{actor_id:string;payload_hash:string;result_json:string}>();
    if(!row)return undefined;
    if(row.actor_id!==p.userId||row.payload_hash!==digest)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","La clave ya pertenece a otra operación.");
    return JSON.parse(row.result_json) as T;
  }
  const old=await replay();if(old!==undefined)return old;
  const batch=new Batch(db);
  batch.guard("EXISTS(SELECT 1 FROM users WHERE id=? AND role='ADMIN' AND is_active=1)",p.userId);
  if(operationKey)batch.guard("NOT EXISTS(SELECT 1 FROM ledger_movements WHERE idempotency_key=?)",operationKey);
  if(operationKey)batch.add("INSERT INTO operation_requests(idempotency_key,actor_id,payload_hash,result_json) VALUES(?,?,?,?)",operationKey,p.userId,digest,JSON.stringify(result));
  await build(batch);
  try{await db.batch(batch.finish());return result;}catch(error){const retry=await replay();if(retry!==undefined)return retry;if(error instanceof ApiError)throw error;throw new ApiError(409,"OPERATION_CONFLICT","Los datos cambiaron o la operación no cumple las condiciones. Actualiza y revisa antes de confirmar.");}
}
