import "server-only";
import type {FirebaseIdentity,Principal} from "./auth/types";
import {ApiError} from "./security/errors";
import {email,text} from "./api";
import {Batch,hash} from "./admin/transaction";
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unbase64(value:string):Uint8Array{if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error();return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
async function signingKey(db:D1Database){
 const candidate=base64(crypto.getRandomValues(new Uint8Array(32)));
 await db.prepare("INSERT INTO app_secrets(name,value) SELECT 'link_hmac',? WHERE NOT EXISTS(SELECT 1 FROM app_secrets WHERE name='link_hmac')").bind(candidate).run();
 const row=await db.prepare("SELECT value FROM app_secrets WHERE name='link_hmac'").first<{value:string}>();
 if(!row)throw new ApiError(503,"LINK_NOT_CONFIGURED","No se pudo preparar el vínculo.");
 return crypto.subtle.importKey("raw",unbase64(row.value) as BufferSource,{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function issueLink(db:D1Database,p:Principal,input:Record<string,unknown>,origin:string){
 const clientId=text(input.client_id,"la tarjeta",100),dispatchId=text(input.dispatch_id,"el recorrido",100);
 if(p.role!=="WORKER"&&p.role!=="ADMIN")throw new ApiError(403,"ROLE_FORBIDDEN","No puedes vincular esta tarjeta.");
 if(p.role==="WORKER"&&!(await db.prepare("SELECT 1 ok FROM dispatch_workers w JOIN route_dispatches d ON d.id=w.dispatch_id JOIN users u ON u.id=w.worker_user_id WHERE w.dispatch_id=? AND w.worker_user_id=? AND d.status='OPEN' AND u.is_active=1").bind(dispatchId,p.userId).first()))throw new ApiError(403,"DISPATCH_FORBIDDEN","No tienes acceso a ese recorrido.");
 const client=await db.prepare("SELECT firebase_uid,linked_email,is_active FROM clients WHERE id=?").bind(clientId).first<{firebase_uid:string|null;linked_email:string|null;is_active:number}>();
 if(!client)throw new ApiError(404,"CLIENT_NOT_FOUND","No se encontró la tarjeta.");
 if(client.firebase_uid||client.is_active!==1)throw new ApiError(409,"CARD_ALREADY_LINKED","La tarjeta ya está vinculada o inactiva. Solicita revisión al administrador.");
 const linkedEmail=input.linked_email===undefined?client.linked_email:email(input.linked_email);
 const expiresAt=new Date(Date.now()+600_000).toISOString();
 const body=base64(new TextEncoder().encode(JSON.stringify({c:clientId,e:Math.floor(new Date(expiresAt).getTime()/1000),n:base64(crypto.getRandomValues(new Uint8Array(24)))})));
 const key=await signingKey(db);const signature=base64(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body))));const token=`${body}.${signature}`;
 const batch=new Batch(db);
 batch.guard("EXISTS(SELECT 1 FROM clients WHERE id=? AND firebase_uid IS NULL AND is_active=1 AND linked_email IS ?)",clientId,client.linked_email);
 batch.guard("EXISTS(SELECT 1 FROM users WHERE id=? AND role IN('WORKER','ADMIN') AND is_active=1)",p.userId);
 if(p.role==="WORKER")batch.guard("EXISTS(SELECT 1 FROM dispatch_workers w JOIN route_dispatches d ON d.id=w.dispatch_id WHERE w.dispatch_id=? AND w.worker_user_id=? AND d.status='OPEN')",dispatchId,p.userId);
 if(linkedEmail)batch.guard("NOT EXISTS(SELECT 1 FROM users WHERE email=?)",linkedEmail);
 batch.add("UPDATE clients SET linked_email=?,revision=revision+1 WHERE id=? AND firebase_uid IS NULL",linkedEmail,clientId);batch.changed();
 batch.add("UPDATE link_tokens SET consumed_at=datetime('now') WHERE client_id=? AND consumed_at IS NULL",clientId);
 batch.add("INSERT INTO link_tokens(token_hash,client_id,created_by,expires_at) VALUES(?,?,?,?)",await hash(token),clientId,p.userId,expiresAt);
 batch.audit(p,"LINK_ISSUED",clientId,"Vínculo solicitado en la puerta",{linked_email:client.linked_email},{linked_email:linkedEmail,expires_at:expiresAt});
 try{await db.batch(batch.finish());}catch{throw new ApiError(409,"LINK_CONFLICT","La tarjeta o el correo cambió. Actualiza y revisa el vínculo.");}
 const url=new URL("/vincular",origin);url.hash=new URLSearchParams({token}).toString();
 return{url:url.href,expires_at:expiresAt};
}
export async function consumeLink(db:D1Database,identity:FirebaseIdentity,rawToken:unknown){
 const token=text(rawToken,"el vínculo",1800);let clientId:string;
 try {
  const parts=token.split(".");if(parts.length!==2)throw new Error();
  const payload=JSON.parse(new TextDecoder().decode(unbase64(parts[0])));
  if(typeof payload.c!=="string"||!Number.isInteger(payload.e)||payload.e<=Math.floor(Date.now()/1000)||payload.e>Math.floor(Date.now()/1000)+600)throw new Error();
  if(!await crypto.subtle.verify("HMAC",await signingKey(db),unbase64(parts[1]) as BufferSource,new TextEncoder().encode(parts[0])))throw new Error();clientId=payload.c;
 }catch{throw new ApiError(400,"INVALID_LINK","El vínculo no es válido o ha vencido. Solicita uno nuevo.");}
 const tokenHash=await hash(token),batch=new Batch(db);
 batch.guard("EXISTS(SELECT 1 FROM link_tokens WHERE token_hash=? AND client_id=? AND consumed_at IS NULL AND expires_at>?)",tokenHash,clientId,new Date().toISOString());
 batch.guard("NOT EXISTS(SELECT 1 FROM users WHERE firebase_uid=? OR email=?)",identity.uid,identity.email);
 batch.guard("NOT EXISTS(SELECT 1 FROM clients WHERE firebase_uid=? AND id<>?)",identity.uid,clientId);
 batch.add("UPDATE clients SET firebase_uid=?,linked_email=?,revision=revision+1 WHERE id=? AND firebase_uid IS NULL AND is_active=1 AND (linked_email IS NULL OR linked_email=?)",identity.uid,identity.email,clientId,identity.email);batch.changed();
 batch.add("UPDATE link_tokens SET consumed_at=datetime('now') WHERE token_hash=? AND consumed_at IS NULL",tokenHash);batch.changed();
 // Creator is the preauthorized worker/admin responsible for issuing the link.
 batch.add("INSERT INTO audit_events(id,actor_id,action,entity_id,reason,previous_json,next_json) SELECT ?,created_by,'LINK_CONSUMED',client_id,'Google verificado consume vínculo',?,? FROM link_tokens WHERE token_hash=?",crypto.randomUUID(),JSON.stringify({firebase_uid:null}),JSON.stringify({firebase_uid:identity.uid,linked_email:identity.email}),tokenHash);
 try{await db.batch(batch.finish());}catch{throw new ApiError(409,"LINK_CONFLICT","El vínculo ya fue utilizado, venció o corresponde a otra cuenta. No se reemplazó ninguna tarjeta.");}
 return{client_id:clientId};
}
