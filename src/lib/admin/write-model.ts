import "server-only";
import type {Principal} from "../auth/types";
import {email,integer,text,uuid} from "../api";
import {ApiError} from "../security/errors";
import {clientRow,dispatchInventory} from "./read-model";
import {hash,mutation} from "./transaction";

type Input=Record<string,unknown>;
function active(value:unknown){return value===undefined?1:integer(value,"el estado",0,1);}
function date(value:unknown){const result=text(value,"la fecha",10);const parsed=new Date(`${result}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==result)throw new ApiError(400,"INVALID_DATE","Revisa la fecha del recorrido.");return result;}
function array(value:unknown,label:string,max=100):unknown[]{if(!Array.isArray(value)||value.length===0||value.length>max)throw new ApiError(400,"INVALID_FIELD",`Revisa ${label}.`);return value;}
function object(value:unknown):Input{if(!value||typeof value!=="object"||Array.isArray(value))throw new ApiError(400,"INVALID_FIELD","Revisa los productos.");return value as Input;}
// Previous audit metadata excludes stock: its exact transition is captured by
// stock_events inside the batch, after any concurrent delivery or ingress.
async function productRow(db:D1Database,id:string){const row=await db.prepare("SELECT p.id,p.name,p.cost_price,p.credit_price,p.is_active,p.category_id,c.name category_name FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=?").bind(id).first<{id:string;name:string;cost_price:number;credit_price:number;is_active:number;category_id:string|null;category_name:string|null}>();if(!row)throw new ApiError(404,"PRODUCT_NOT_FOUND","No se encontró el producto.");return row;}

export async function saveProduct(db:D1Database,p:Principal,input:Input){
 const stockQty=integer(input.stock_qty===undefined?0:input.stock_qty,"las unidades a agregar",0,1_000_000);
 const operationKey=input.idempotency_key===undefined?undefined:uuid(input.idempotency_key);
 if(stockQty>0&&!operationKey)throw new ApiError(400,"INVALID_UUID","La clave de la operación es necesaria para agregar unidades.");
 const id=input.id===undefined?(operationKey?`product-${operationKey}`:crypto.randomUUID()):text(input.id,"el producto",100);
 const next={name:text(input.name,"el nombre",140),cost_price:integer(input.cost_price,"el costo"),credit_price:integer(input.credit_price,"el precio fiado"),is_active:active(input.is_active)};
 const categoryRequest=input.category_name===undefined?undefined:input.category_name===null||input.category_name===""||(typeof input.category_name==="string"&&!input.category_name.trim())?null:text(input.category_name,"el producto principal",140);
 const automaticReason=input.id===undefined?"Producto creado":"Producto actualizado";
 const reason=input.reason===undefined||(typeof input.reason==="string"&&!input.reason.trim())?automaticReason:text(input.reason,"el motivo",500);
 const old=input.id===undefined?null:await productRow(db,id);
 const categoryName=categoryRequest===undefined?old?.category_name??null:categoryRequest;
 // Hash only request data: replay must survive later price/category changes.
 return mutation(db,p,"PRODUCT_SAVE",{id:input.id===undefined?null:id,...next,category_name:categoryRequest??null,category_provided:categoryRequest!==undefined,stock_qty:stockQty,reason},operationKey,{ok:true},b=>{
  if(categoryName)b.add("INSERT INTO product_categories(id,name) VALUES(?,?) ON CONFLICT(name) DO NOTHING",crypto.randomUUID(),categoryName);
  const categorySql="(SELECT id FROM product_categories WHERE name=? COLLATE NOCASE)";
  if(old){b.add(`UPDATE products SET name=?,cost_price=?,credit_price=?,is_active=?,category_id=${categorySql} WHERE id=? AND name=? AND cost_price=? AND credit_price=? AND is_active=? AND category_id IS ?`,next.name,next.cost_price,next.credit_price,next.is_active,categoryName,id,old.name,old.cost_price,old.credit_price,old.is_active,old.category_id);b.changed();}
  else b.add(`INSERT INTO products(id,name,cost_price,credit_price,is_active,category_id) VALUES(?,?,?,?,?,${categorySql})`,id,next.name,next.cost_price,next.credit_price,next.is_active,categoryName);
  if(stockQty){
   b.add("INSERT INTO stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason) SELECT ?,?,id,?,total_stock,total_stock+?,'Ingreso a bodega al guardar producto' FROM products WHERE id=?",crypto.randomUUID(),p.userId,stockQty,stockQty,id);b.changed();
   b.add("UPDATE products SET total_stock=total_stock+? WHERE id=?",stockQty,id);b.changed();
  }
  b.add("INSERT INTO audit_events(id,actor_id,action,entity_id,reason,previous_json,next_json) SELECT ?,?,'PRODUCT_SAVE',?,?,?,json_object('name',p.name,'cost_price',p.cost_price,'credit_price',p.credit_price,'is_active',p.is_active,'category_id',p.category_id,'category_name',c.name,'total_stock',p.total_stock,'stock_qty',?) FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=?",crypto.randomUUID(),p.userId,id,reason,JSON.stringify(old),stockQty,id);b.changed();
 });
}
export async function changeStock(db:D1Database,p:Principal,input:Input,purchase:boolean){
 const productId=text(input.product_id,"el producto",100),delta=purchase?integer(input.qty,"la cantidad",1,1_000_000):integer(input.delta,"el ajuste",-1_000_000,1_000_000),reason=text(input.reason,"el motivo",500);
 if(delta===0)throw new ApiError(400,"EMPTY_ADJUSTMENT","El ajuste debe cambiar el inventario.");
 const cost=purchase?integer(input.unit_cost_price,"el costo de compra"):null;
 // Do not read current stock before replay: a previous success is still replayable.
 return mutation(db,p,purchase?"PURCHASE":"STOCK_ADJUST",{productId,delta,cost,reason},uuid(input.idempotency_key),{ok:true},b=>{
  b.add("INSERT INTO stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason) SELECT ?,?,id,?,total_stock,total_stock+?,? FROM products WHERE id=?",crypto.randomUUID(),p.userId,delta,delta,reason,productId);b.changed();
  if(purchase)b.add("UPDATE products SET total_stock=total_stock+?,cost_price=? WHERE id=?",delta,cost,productId);
  else b.add("UPDATE products SET total_stock=total_stock+? WHERE id=?",delta,productId);
  b.changed();b.audit(p,purchase?"PURCHASE":"STOCK_ADJUST",productId,reason,null,{delta,unit_cost_price:cost});
 });
}
export async function createDispatch(db:D1Database,p:Principal,input:Input){
 const id=crypto.randomUUID(),name=text(input.name,"el nombre",140),dispatchDate=date(input.dispatch_date);
 const workers=array(input.worker_ids,"los trabajadores",30).map(v=>text(v,"el trabajador",100));
 const items=array(input.items,"la carga").map(v=>{const row=object(v);return{product_id:text(row.product_id,"el producto",100),qty:integer(row.qty,"la carga",1,1_000_000)};});
 if(new Set(workers).size!==workers.length||new Set(items.map(i=>i.product_id)).size!==items.length)throw new ApiError(400,"DUPLICATE_ITEMS","No repitas trabajadores ni productos.");
 return mutation(db,p,"DISPATCH_CREATE",{name,dispatchDate,workers,items},undefined,{id},b=>{
  b.add("INSERT INTO route_dispatches(id,name,dispatch_date) VALUES(?,?,?)",id,name,dispatchDate);
  for(const worker of workers)b.add("INSERT INTO dispatch_workers(dispatch_id,worker_user_id) VALUES(?,?)",id,worker);
  for(const item of items){b.guard("EXISTS(SELECT 1 FROM products WHERE id=? AND is_active=1)",item.product_id);b.add("INSERT INTO dispatch_inventory(id,dispatch_id,product_id,initial_qty,remaining_qty) VALUES(?,?,?,?,?)",crypto.randomUUID(),id,item.product_id,item.qty,item.qty);}
  b.audit(p,"DISPATCH_CREATE",id,"Carga inicial del recorrido",null,{name,dispatchDate,workers,items});
 });
}
export async function saveWorker(db:D1Database,p:Principal,input:Input){
 const id=input.id===undefined?crypto.randomUUID():text(input.id,"el trabajador",100),name=text(input.name,"el nombre",140),workerEmail=email(input.email),isActive=active(input.is_active),reason=text(input.reason,"el motivo",500);
 if(!workerEmail)throw new ApiError(400,"EMAIL_REQUIRED","Escribe el correo Google del trabajador.");
 const old=input.id?await db.prepare("SELECT id,name,email,is_active FROM users WHERE id=? AND role='WORKER'").bind(id).first<{id:string;name:string;email:string;is_active:number}>():null;
 if(input.id&&!old)throw new ApiError(404,"WORKER_NOT_FOUND","No se encontró el trabajador.");
 return mutation(db,p,"WORKER_SAVE",{id,name,workerEmail,isActive,reason},undefined,{ok:true},b=>{
  b.guard("NOT EXISTS(SELECT 1 FROM clients WHERE linked_email=?)",workerEmail);
  if(!isActive)b.guard("NOT EXISTS(SELECT 1 FROM dispatch_workers w JOIN route_dispatches d ON d.id=w.dispatch_id WHERE w.worker_user_id=? AND d.status='OPEN' AND w.pending_sync_confirmed_at IS NULL)",id);
  if(old){b.add("UPDATE users SET name=?,email=?,is_active=? WHERE id=? AND role='WORKER' AND name=? AND email=? AND is_active=?",name,workerEmail,isActive,id,old.name,old.email,old.is_active);b.changed();}
  else b.add("INSERT INTO users(id,name,email,role,is_active) VALUES(?,?,?,'WORKER',?)",id,name,workerEmail,isActive);
  b.audit(p,"WORKER_SAVE",id,reason,old,{name,email:workerEmail,is_active:isActive});
 });
}
export async function saveClient(db:D1Database,p:Principal,input:Input){
 const id=input.id===undefined?crypto.randomUUID():text(input.id,"la tarjeta",100),name=text(input.name,"el nombre",140),address=text(input.address,"la dirección",240),reference=text(input.address_reference,"la referencia",240),linkedEmail=email(input.linked_email),isActive=active(input.is_active);
 const automaticReason=input.id===undefined?"Tarjeta creada":"Tarjeta actualizada";
 const reason=input.reason===undefined||(typeof input.reason==="string"&&!input.reason.trim())?automaticReason:text(input.reason,"el motivo",500);
 if(input.id!==undefined&&(input.opening_balance!==undefined||input.opening_items!==undefined))throw new ApiError(400,"OPENING_ONLY_ON_CREATE","La deuda inicial se fija al crear la tarjeta. Usa un ajuste con motivo para corregirla.");
 if(input.opening_items!==undefined&&(!Array.isArray(input.opening_items)||input.opening_items.length>50))throw new ApiError(400,"INVALID_OPENING_ITEMS","Revisa los productos de la deuda inicial.");
 const openingItems=((input.opening_items??[]) as unknown[]).map(value=>{
  const row=object(value);
  if(Object.keys(row).some(key=>!["product_id","qty","unit_credit_price"].includes(key)))throw new ApiError(400,"INVALID_OPENING_ITEMS","Revisa los productos de la deuda inicial.");
  const item={product_id:text(row.product_id,"el producto",100),qty:integer(row.qty,"la cantidad",1,100_000),unit_credit_price:integer(row.unit_credit_price,"el precio fiado anterior")};
  integer(item.qty*item.unit_credit_price,"el importe del producto");return item;
 }).sort((a,b)=>a.product_id.localeCompare(b.product_id));
 if(new Set(openingItems.map(item=>item.product_id)).size!==openingItems.length)throw new ApiError(400,"DUPLICATE_ITEMS","Cada producto debe aparecer una sola vez en la deuda inicial.");
 if(openingItems.length&&input.opening_balance!==undefined)throw new ApiError(400,"AMBIGUOUS_OPENING","Selecciona productos o escribe un saldo anterior, sin combinar ambos.");
 const old=input.id?await clientRow(db,id):null,order=input.route_order===undefined?old?.route_order??null:integer(input.route_order,"el orden",1,1_000_000);
 const openingBalance=old?0:openingItems.length?integer(openingItems.reduce((sum,item)=>sum+item.qty*item.unit_credit_price,0),"la deuda inicial"):integer(input.opening_balance??0,"el saldo de apertura",-1_000_000_000,1_000_000_000);
 const operationKey=old?(input.idempotency_key===undefined?undefined:uuid(input.idempotency_key)):uuid(input.idempotency_key);
 const privateOld=old?await db.prepare("SELECT firebase_uid FROM clients WHERE id=?").bind(id).first():null;
 const target=old&&order!==old.route_order?await db.prepare("SELECT id,route_order,revision FROM clients WHERE route_order=? AND id<>?").bind(order,id).first<{id:string;route_order:number;revision:number}>():null;
 // Only requested values enter the hash; replay survives catalog changes and
 // subsequent balance/order changes. Preserve the legacy manual-opening hash.
 return mutation(db,p,"CLIENT_SAVE",{id:old?id:null,name,address,reference,linkedEmail,isActive,order:old&&input.route_order===undefined?null:order,reason,openingBalance,...(openingItems.length?{openingItems}:{})},operationKey,{id},b=>{
  if(linkedEmail)b.guard("NOT EXISTS(SELECT 1 FROM users WHERE email=?)",linkedEmail);
  if(old){
   if(target){b.add("UPDATE clients SET route_order=(SELECT MAX(route_order)+1 FROM clients) WHERE id=? AND revision=?",target.id,target.revision);b.changed();}
   b.add("UPDATE clients SET name=?,address=?,address_reference=?,route_order=?,linked_email=?,firebase_uid=CASE WHEN linked_email IS ? THEN firebase_uid ELSE NULL END,is_active=?,revision=revision+1 WHERE id=? AND revision=?",name,address,reference,order,linkedEmail,linkedEmail,isActive,id,old.revision);b.changed();
   if(old.linked_email!==linkedEmail||!isActive)b.add("UPDATE link_tokens SET consumed_at=datetime('now') WHERE client_id=? AND consumed_at IS NULL",id);
   if(target){b.add("UPDATE clients SET route_order=?,revision=revision+1 WHERE id=? AND revision=?",old.route_order,target.id,target.revision);b.changed();b.audit(p,"CLIENT_ORDER_SWAP",target.id,reason,{route_order:target.route_order},{route_order:old.route_order});}
  }else{
   const movementId=crypto.randomUUID();
   b.add("INSERT INTO clients(id,name,address,address_reference,route_order,linked_email,is_active,current_balance,revision) VALUES(?,?,?,?,COALESCE(?,(SELECT COALESCE(MAX(route_order),0)+1 FROM clients)),?,?,?,1)",id,name,address,reference,order,linkedEmail,isActive,openingBalance);
   b.add("INSERT INTO ledger_movements(id,idempotency_key,client_id,worker_user_id,movement_type,previous_balance,adjustment_amount,new_balance,reason,client_sequence) VALUES(?,?,?,?,'OPENING',0,?,?,?,1)",movementId,crypto.randomUUID(),id,p.userId,openingBalance,openingBalance,reason);
   for(const item of openingItems){
    // Historical prices are supplied by the administrator. Current costs,
    // activity and stock do not describe these earlier deliveries.
    b.add("INSERT INTO opening_items(id,movement_id,product_id,product_name_snapshot,qty,unit_credit_price,subtotal) SELECT ?,?,p.id,CASE WHEN c.id IS NULL THEN p.name ELSE c.name||' · '||p.name END,?,?,? FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=?",crypto.randomUUID(),movementId,item.qty,item.unit_credit_price,item.qty*item.unit_credit_price,item.product_id);b.changed();
   }
   if(openingItems.length)b.guard("(SELECT COALESCE(SUM(subtotal),0) FROM opening_items WHERE movement_id=?)=?",movementId,openingBalance);
  }
  b.audit(p,"CLIENT_SAVE",id,reason,old?{...old,...privateOld}:null,{name,address,address_reference:reference,route_order:order,linked_email:linkedEmail,is_active:isActive,opening_balance:old?null:openingBalance,...(openingItems.length?{opening_items:openingItems}:{}),uid_revoked:!!old&&old.linked_email!==linkedEmail});
 });
}
export async function adjustBalance(db:D1Database,p:Principal,input:Input){
 const clientId=text(input.client_id,"la tarjeta",100),revision=integer(input.expected_revision,"la revisión"),delta=integer(input.delta,"el ajuste",-1_000_000_000,1_000_000_000),reason=text(input.reason,"el motivo",500);
 if(!delta)throw new ApiError(400,"EMPTY_ADJUSTMENT","El ajuste debe cambiar el saldo.");
 const digest=await hash({clientId,revision,delta,reason}),movementId=crypto.randomUUID();
 return mutation(db,p,"BALANCE_ADJUST",{clientId,revision,delta,reason},uuid(input.idempotency_key),{ok:true},b=>{
  b.add("INSERT INTO ledger_movements(id,idempotency_key,client_id,worker_user_id,movement_type,previous_balance,adjustment_amount,new_balance,reason,client_sequence,request_hash) SELECT ?,?,?,?,'ADJUSTMENT',current_balance,?,current_balance+?,?,revision+1,? FROM clients WHERE id=? AND revision=?",movementId,`adjust:${movementId}`,clientId,p.userId,delta,delta,reason,digest,clientId,revision);b.changed();
  b.add("UPDATE clients SET current_balance=current_balance+?,revision=revision+1 WHERE id=? AND revision=?",delta,clientId,revision);b.changed();
  b.audit(p,"BALANCE_ADJUST",clientId,reason,{revision},{delta,movement_id:movementId});
 });
}
export async function decideTransfer(db:D1Database,p:Principal,input:Input){
 const movementId=text(input.movement_id,"el movimiento",100),status=text(input.status,"la decisión",12),reason=text(input.reason,"el motivo",500);
 if(!["VERIFIED","OBSERVED","REJECTED"].includes(status))throw new ApiError(400,"INVALID_STATUS","Revisa la decisión bancaria.");
 return mutation(db,p,"TRANSFER_DECIDE",{movementId,status,reason},uuid(input.idempotency_key),{ok:true},async b=>{
  const old=await db.prepare("SELECT id,client_id,payment_amount,transfer_status FROM ledger_movements WHERE id=? AND movement_type='VISIT' AND payment_method='TRANSFER'").bind(movementId).first<{id:string;client_id:string;payment_amount:number;transfer_status:string}>();
  if(!old)throw new ApiError(404,"TRANSFER_NOT_FOUND","No se encontró la transferencia.");
  if(old.transfer_status==="REJECTED")throw new ApiError(409,"REJECTION_FINAL","La transferencia ya tiene un reverso definitivo.");
  if(status==="REJECTED"){
   const reversalId=crypto.randomUUID();
   b.guard("EXISTS(SELECT 1 FROM ledger_movements WHERE id=? AND transfer_status=?)",movementId,old.transfer_status);
   b.add("INSERT INTO ledger_movements(id,idempotency_key,client_id,worker_user_id,movement_type,previous_balance,adjustment_amount,new_balance,reason,reverses_movement_id,client_sequence,request_hash) SELECT ?,?,?,?,'TRANSFER_REVERSAL',current_balance,?,current_balance+?,?,?,revision+1,? FROM clients WHERE id=?",reversalId,`reversal:${movementId}`,old.client_id,p.userId,old.payment_amount,old.payment_amount,reason,movementId,await hash({movementId,status,reason}),old.client_id);b.changed();
   b.add("UPDATE clients SET current_balance=current_balance+?,revision=revision+1 WHERE id=?",old.payment_amount,old.client_id);b.changed();
  }else{b.add("UPDATE ledger_movements SET transfer_status=? WHERE id=? AND transfer_status=?",status,movementId,old.transfer_status);b.changed();}
  b.audit(p,"TRANSFER_DECIDE",movementId,reason,{status:old.transfer_status},{status});
 });
}
export async function closeDispatch(db:D1Database,p:Principal,input:Input){
 const dispatchId=text(input.dispatch_id,"el recorrido",100),receivedCash=integer(input.received_cash,"el efectivo recibido"),reason=typeof input.reason==="string"?input.reason.trim():"";
 if(reason.length>500)throw new ApiError(400,"INVALID_REASON","El motivo es demasiado largo.");
 if(input.returns_confirmed!==true)throw new ApiError(400,"RETURN_CONFIRMATION_REQUIRED","Confirma la devolución física.");
 const returns=array(input.returns,"los sobrantes").map(v=>{const row=object(v);return{product_id:text(row.product_id,"el producto",100),received_qty:integer(row.received_qty,"la cantidad devuelta",0,1_000_000)};});
 if(new Set(returns.map(r=>r.product_id)).size!==returns.length)throw new ApiError(400,"DUPLICATE_ITEMS","No repitas productos.");
 return mutation(db,p,"DISPATCH_CLOSE",{dispatchId,receivedCash,reason,returns:[...returns].sort((a,c)=>a.product_id.localeCompare(c.product_id))},uuid(input.idempotency_key),{ok:true},async b=>{
  const inventory=await dispatchInventory(db,dispatchId);
  const totals=await db.prepare("SELECT COALESCE(SUM(payment_amount),0) cash FROM ledger_movements WHERE dispatch_id=? AND payment_method='CASH'").bind(dispatchId).first<{cash:number}>();const expectedCash=totals?.cash??0;
  if(inventory.length!==returns.length||inventory.some(i=>!returns.find(r=>r.product_id===i.id)))throw new ApiError(400,"INCOMPLETE_RETURNS","Confirma la cantidad devuelta de cada producto.");
  if((expectedCash!==receivedCash||inventory.some(i=>returns.find(r=>r.product_id===i.id)?.received_qty!==i.remaining_qty))&&!reason)throw new ApiError(400,"DIFFERENCE_REASON_REQUIRED","Explica las diferencias del cuadre.");
  b.guard("EXISTS(SELECT 1 FROM route_dispatches WHERE id=? AND status='OPEN')",dispatchId);
  b.guard("NOT EXISTS(SELECT 1 FROM dispatch_workers WHERE dispatch_id=? AND pending_sync_confirmed_at IS NULL)",dispatchId);
  b.guard("(SELECT COALESCE(SUM(payment_amount),0) FROM ledger_movements WHERE dispatch_id=? AND payment_method='CASH')=?",dispatchId,expectedCash);
  for(const row of inventory)b.guard("EXISTS(SELECT 1 FROM dispatch_inventory WHERE dispatch_id=? AND product_id=? AND remaining_qty=?)",dispatchId,row.id,row.remaining_qty);
  b.add("INSERT INTO dispatch_closures(dispatch_id,admin_id,expected_cash,received_cash,reason) VALUES(?,?,?,?,?)",dispatchId,p.userId,expectedCash,receivedCash,reason||"Cuadre sin diferencias");
  for(const row of inventory)b.add("INSERT INTO dispatch_returns(dispatch_id,product_id,expected_qty,received_qty) VALUES(?,?,?,?)",dispatchId,row.id,row.remaining_qty,returns.find(r=>r.product_id===row.id)!.received_qty);
  b.add("UPDATE route_dispatches SET status='CLOSED' WHERE id=? AND status='OPEN'",dispatchId);b.changed();
  // Release reservations first; only a physical difference adjusts total stock.
  for(const row of inventory){const received=returns.find(r=>r.product_id===row.id)!.received_qty;const delta=received-row.remaining_qty;if(delta){b.add("INSERT INTO stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason) SELECT ?,?,id,?,total_stock,total_stock+?,? FROM products WHERE id=?",crypto.randomUUID(),p.userId,delta,delta,reason,row.id);b.changed();b.add("UPDATE products SET total_stock=total_stock+? WHERE id=?",delta,row.id);b.changed();}}
  b.audit(p,"DISPATCH_CLOSE",dispatchId,reason||"Cuadre sin diferencias",{cash:expectedCash,inventory},{received_cash:receivedCash,returns});
 });
}
