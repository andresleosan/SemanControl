import "server-only";
import type {Principal} from "./auth/types";
import type {VisitInput} from "./contracts";
import {ApiError} from "./security/errors";
import {text,uuid} from "./api";
import {assertAssignment,canonicalJson,digest} from "./operations/core";
import {parseVisit} from "./operations/visits";
import {inspectWebP} from "./operations/receipts";
import {Batch,mutation} from "./admin/transaction";
type Env=Pick<CloudflareEnv,"DB"|"RECEIPTS_BUCKET">;
interface Incident {id:string;worker_user_id:string;client_id:string;dispatch_id:string;payload_json:string;payload_hash:string;file_hash:string|null;receipt_r2_key:string|null;status:string;resolution_note:string|null;adjustment_id:string|null}
export async function reportIncident(env:Env,p:Principal,body:Record<string,unknown>,photo?:Blob){
 const input=parseVisit(body);await assertAssignment(env.DB,p,input.dispatch_id);
 const hash=await digest(canonicalJson(body));
 const existingMovement=await env.DB.prepare("SELECT id,worker_user_id,request_hash FROM ledger_movements WHERE idempotency_key=?").bind(input.idempotency_key).first<{id:string;worker_user_id:string;request_hash:string}>();
 if(existingMovement){if(existingMovement.worker_user_id!==p.userId||existingMovement.request_hash!==hash)throw new ApiError(409,"OPERATION_CONFLICT","La clave pertenece a otra operación.");return{already_registered:true,movement_id:existingMovement.id};}
 const route=await env.DB.prepare("SELECT status FROM route_dispatches WHERE id=?").bind(input.dispatch_id).first<{status:string}>();
 if(route?.status!=="CLOSED")throw new ApiError(409,"DISPATCH_NOT_CLOSED","Este recorrido sigue abierto. Revisa y confirma el pendiente desde la visita.");
 let bytes:ArrayBuffer|undefined,fileHash:string|null=null;
 if(photo){if(photo.type!=="image/webp"||photo.size>512000||photo.size===0)throw new ApiError(400,"INVALID_WEBP","El comprobante debe ser WebP de hasta 500 KB.");bytes=await photo.arrayBuffer();inspectWebP(bytes);fileHash=await digest(bytes);}
 if(input.payment_method==="TRANSFER"&&!photo)throw new ApiError(400,"RECEIPT_REQUIRED","Conserva y adjunta el comprobante de la transferencia.");
 async function replay(){const row=await env.DB.prepare("SELECT worker_user_id,payload_hash,file_hash FROM operation_incidents WHERE id=?").bind(input.idempotency_key).first<{worker_user_id:string;payload_hash:string;file_hash:string|null}>();if(!row)return null;if(row.worker_user_id!==p.userId||row.payload_hash!==hash||row.file_hash!==fileHash)throw new ApiError(409,"INCIDENT_CONFLICT","La clave pertenece a otra incidencia.");return{incident_id:input.idempotency_key};}
 const previous=await replay();if(previous)return previous;
 const key=bytes?`incidents/${p.userId}/${input.idempotency_key}/${fileHash}.webp`:null;
 if(key){
  const starting=new Batch(env.DB);
  starting.guard("NOT EXISTS(SELECT 1 FROM operation_guards WHERE id=?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='WORKER' AND is_active=1)",`receipt-object-cleanup:${key}`,p.userId);
  starting.audit(p,"INCIDENT_UPLOAD_STARTED",input.idempotency_key,"Inicio de comprobante privado de incidencia",null,{r2_key:key});
  try{await env.DB.batch(starting.finish());}catch{throw new ApiError(409,"INCIDENT_CONFLICT","El archivo está en revisión o limpieza. Conserva la incidencia.");}
 }
 if(bytes&&key)await env.RECEIPTS_BUCKET.put(key,bytes,{httpMetadata:{contentType:"image/webp"}});
 const b=new Batch(env.DB);
 if(key)b.guard("NOT EXISTS(SELECT 1 FROM operation_guards WHERE id=?)",`receipt-object-cleanup:${key}`);
 b.guard("EXISTS(SELECT 1 FROM route_dispatches d JOIN dispatch_workers w ON w.dispatch_id=d.id JOIN users u ON u.id=w.worker_user_id WHERE d.id=? AND d.status='CLOSED' AND w.worker_user_id=? AND u.is_active=1)",input.dispatch_id,p.userId);
 b.guard("NOT EXISTS(SELECT 1 FROM ledger_movements WHERE idempotency_key=?) AND NOT EXISTS(SELECT 1 FROM operation_requests WHERE idempotency_key=?)",input.idempotency_key,input.idempotency_key);
 b.add("INSERT INTO operation_incidents(id,worker_user_id,client_id,dispatch_id,payload_json,payload_hash,file_hash,receipt_r2_key) VALUES(?,?,?,?,?,?,?,?)",input.idempotency_key,p.userId,input.client_id,input.dispatch_id,JSON.stringify(body),hash,fileHash,key);
 b.audit(p,"LATE_OPERATION_REPORTED",input.client_id,"Operación física pendiente tras cierre",null,{incident_id:input.idempotency_key,dispatch_id:input.dispatch_id});
 try{await env.DB.batch(b.finish());}catch{
  const winner=await env.DB.prepare("SELECT receipt_r2_key FROM operation_incidents WHERE id=?").bind(input.idempotency_key).first<{receipt_r2_key:string|null}>();
  if(key&&winner?.receipt_r2_key!==key)await env.RECEIPTS_BUCKET.delete(key);
  const duplicate=await replay();if(duplicate)return duplicate;
  throw new ApiError(409,"INCIDENT_CONFLICT","No se pudo registrar la incidencia. El pendiente sigue conservado en tu teléfono.");
 }
 return{incident_id:input.idempotency_key};
}
export async function listIncidents(db:D1Database,dispatchId:string|null){
 const rows=(await db.prepare("SELECT i.id,i.client_id,i.dispatch_id,c.name client_name,u.name worker_name,i.payload_json,i.status,i.created_at,i.receipt_r2_key IS NOT NULL receipt_available,i.resolution_note,i.adjustment_id FROM operation_incidents i JOIN clients c ON c.id=i.client_id JOIN users u ON u.id=i.worker_user_id WHERE (? IS NULL OR i.dispatch_id=?) ORDER BY i.status,i.created_at,i.id").bind(dispatchId,dispatchId).all<{payload_json:string;receipt_available:number}&Record<string,unknown>>()).results;
 return{incidents:rows.map(row=>{const {payload_json,receipt_available,...rest}=row;return{...rest,payload:JSON.parse(payload_json) as VisitInput,receipt_available:!!receipt_available};})};
}
export async function resolveIncident(db:D1Database,p:Principal,input:Record<string,unknown>){
 const id=uuid(input.id),reason=text(input.reason,"el motivo de revisión",500),adjustmentId=input.adjustment_id?text(input.adjustment_id,"el ajuste compensatorio",100):null;
 if(p.role!=="ADMIN")throw new ApiError(403,"ROLE_FORBIDDEN","Esta operación requiere administrador.");
 const row=await db.prepare("SELECT id,worker_user_id,client_id,dispatch_id,payload_json,payload_hash,file_hash,receipt_r2_key,status,resolution_note,adjustment_id FROM operation_incidents WHERE id=?").bind(id).first<Incident>();
 if(!row)throw new ApiError(404,"INCIDENT_NOT_FOUND","No se encontró la incidencia.");
 if(row.status==="RESOLVED"){if(row.resolution_note===reason&&row.adjustment_id===adjustmentId)return{ok:true};throw new ApiError(409,"INCIDENT_RESOLVED","La revisión ya fue registrada.");}
 const payload=parseVisit(JSON.parse(row.payload_json));const delta=payload.items.reduce((s,i)=>s+i.qty*i.unit_credit_price,0)-payload.payment_amount;
 if(delta!==0&&!adjustmentId)throw new ApiError(400,"ADJUSTMENT_REQUIRED","Primero registra el ajuste compensatorio en la tarjeta y pega su ID. No se aplicará el cobro otra vez.");
 return mutation(db,p,"INCIDENT_REVIEW",{id,reason,adjustmentId},undefined,{ok:true},b=>{
  if(adjustmentId)b.guard("EXISTS(SELECT 1 FROM ledger_movements WHERE id=? AND client_id=? AND movement_type='ADJUSTMENT' AND adjustment_amount=?) AND NOT EXISTS(SELECT 1 FROM operation_incidents WHERE adjustment_id=? AND id<>?)",adjustmentId,row.client_id,delta,adjustmentId,id);
  b.add("UPDATE operation_incidents SET status='RESOLVED',resolution_note=?,adjustment_id=?,resolved_by=?,resolved_at=datetime('now') WHERE id=? AND status='OPEN'",reason,adjustmentId,p.userId,id);b.changed();b.audit(p,"INCIDENT_REVIEW",row.client_id,reason,{incident_id:id,status:"OPEN"},{status:"RESOLVED",adjustment_id:adjustmentId});
 });
}
export async function incidentReceipt(env:Env,p:Principal,id:string){
 const row=await env.DB.prepare("SELECT worker_user_id,dispatch_id,receipt_r2_key FROM operation_incidents WHERE id=?").bind(id).first<{worker_user_id:string;dispatch_id:string;receipt_r2_key:string|null}>();
 if(!row||!row.receipt_r2_key)throw new ApiError(404,"RECEIPT_NOT_FOUND","No se encontró el comprobante.");
 if(p.role!=="ADMIN"){if(p.role!=="WORKER"||p.userId!==row.worker_user_id)throw new ApiError(403,"RECEIPT_FORBIDDEN","No tienes acceso a este comprobante.");await assertAssignment(env.DB,p,row.dispatch_id);}
 const object=await env.RECEIPTS_BUCKET.get(row.receipt_r2_key);if(!object)throw new ApiError(404,"RECEIPT_NOT_FOUND","No se encontró el comprobante.");
 return new Response(object.body,{headers:{"Content-Type":"image/webp","Content-Security-Policy":"default-src 'none'","Cross-Origin-Resource-Policy":"same-origin"}});
}
