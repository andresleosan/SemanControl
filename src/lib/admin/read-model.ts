import "server-only";
import {ApiError} from "../security/errors";
import type {AdminProduct,ClientCard,Dispatch,Movement,MovementItem,RouteProduct,User} from "../contracts";
export const CLIENT_COLUMNS="id,name,address,address_reference,route_order,linked_email,current_balance,is_active,revision";
export async function clientRow(db:D1Database,id:string):Promise<ClientCard>{const client=await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=?`).bind(id).first<ClientCard>();if(!client)throw new ApiError(404,"CLIENT_NOT_FOUND","No se encontró la tarjeta.");return client;}
export async function history(db:D1Database,clientId:string):Promise<Movement[]>{
 const movements=await db.prepare("SELECT m.id,m.client_id,m.dispatch_id,m.worker_user_id,m.movement_type,m.previous_balance,m.payment_amount,m.payment_method,m.transfer_status,m.charge_amount,m.adjustment_amount,m.new_balance,m.reason,m.created_at,m.client_sequence,r.id receipt_id FROM ledger_movements m LEFT JOIN receipts r ON r.movement_id=m.id WHERE m.client_id=? ORDER BY COALESCE(m.client_sequence,0),m.created_at,m.id").bind(clientId).all<Omit<Movement,"items">>();
 // Explicit projection is shared by ADMIN and CLIENT; private cost never enters it.
 const items=await db.prepare("SELECT i.movement_id,i.product_id,i.product_name_snapshot,i.qty,i.unit_credit_price,i.subtotal FROM movement_items i JOIN ledger_movements m ON m.id=i.movement_id WHERE m.client_id=?").bind(clientId).all<MovementItem&{movement_id:string}>();
 return movements.results.map(m=>({...m,items:items.results.filter(i=>i.movement_id===m.id).map(i=>({product_id:i.product_id,product_name_snapshot:i.product_name_snapshot,qty:i.qty,unit_credit_price:i.unit_credit_price,subtotal:i.subtotal}))}));
}
export async function dispatchInventory(db:D1Database,id:string):Promise<RouteProduct[]>{return (await db.prepare("SELECT p.id,p.name,p.credit_price,i.initial_qty,i.remaining_qty FROM dispatch_inventory i JOIN products p ON p.id=i.product_id WHERE i.dispatch_id=? ORDER BY p.name").bind(id).all<RouteProduct>()).results;}
export async function dispatches(db:D1Database):Promise<Dispatch[]>{
 const routes=(await db.prepare("SELECT id,name,dispatch_date,status FROM route_dispatches ORDER BY dispatch_date DESC,created_at DESC,id").all<Dispatch>()).results;
 const assignments=(await db.prepare("SELECT w.dispatch_id,u.id,u.name FROM dispatch_workers w JOIN users u ON u.id=w.worker_user_id").all<{dispatch_id:string;id:string;name:string}>()).results;
 const inventory=(await db.prepare("SELECT i.dispatch_id,p.id,p.name,p.credit_price,i.initial_qty,i.remaining_qty FROM dispatch_inventory i JOIN products p ON p.id=i.product_id ORDER BY p.name,p.id").all<RouteProduct&{dispatch_id:string}>()).results;
 for(const route of routes){route.workers=assignments.filter(w=>w.dispatch_id===route.id).map(w=>({id:w.id,name:w.name}));route.inventory=inventory.filter(i=>i.dispatch_id===route.id).map(i=>({id:i.id,name:i.name,credit_price:i.credit_price,initial_qty:i.initial_qty,remaining_qty:i.remaining_qty}));}
 return routes;
}
export async function inventoryView(db:D1Database){
 const products=await db.prepare("SELECT p.id,p.name,p.cost_price,p.credit_price,p.total_stock,p.is_active,COALESCE(SUM(CASE WHEN d.status='OPEN' THEN i.remaining_qty ELSE 0 END),0) reserved_stock,p.total_stock-COALESCE(SUM(CASE WHEN d.status='OPEN' THEN i.remaining_qty ELSE 0 END),0) available_stock FROM products p LEFT JOIN dispatch_inventory i ON i.product_id=p.id LEFT JOIN route_dispatches d ON d.id=i.dispatch_id GROUP BY p.id ORDER BY p.name").all<AdminProduct>();
 const workers=await db.prepare("SELECT id,name,email,role,is_active FROM users WHERE role='WORKER' ORDER BY name").all<User>();
 return{products:products.results,workers:workers.results,dispatches:await dispatches(db)};
}
function dateFilter(value:string|null):string|null{if(value){const parsed=new Date(`${value}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new ApiError(400,"INVALID_DATE","Revisa las fechas del período.");}return value;}
export async function clientsView(db:D1Database,params:URLSearchParams){
 const clients=(await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients ORDER BY route_order`).all<ClientCard>()).results;
 const from=dateFilter(params.get("from")),to=dateFilter(params.get("to"));
 if(from&&to&&from>to)throw new ApiError(400,"INVALID_PERIOD","La fecha inicial debe ser anterior al final.");
 const margin=await db.prepare("SELECT COALESCE(SUM(i.qty*(i.unit_credit_price-i.unit_cost_price)),0) amount FROM movement_items i JOIN ledger_movements m ON m.id=i.movement_id WHERE i.unit_cost_price IS NOT NULL AND (? IS NULL OR date(m.created_at,'-5 hours')>=?) AND (? IS NULL OR date(m.created_at,'-5 hours')<=?)").bind(from,from,to,to).first<{amount:number}>();
 const inherited=await db.prepare("SELECT COALESCE(SUM(adjustment_amount),0) amount FROM ledger_movements WHERE movement_type='OPENING'").first<{amount:number}>();
 return{clients,portfolio_total:clients.filter(c=>c.is_active===1).reduce((s,c)=>s+Math.max(0,c.current_balance),0),estimated_margin:margin?.amount??0,inherited_balance:inherited?.amount??0};
}
export async function clientDetail(db:D1Database,id:string){return{client:await clientRow(db,id),history:await history(db,id),audit:(await db.prepare("SELECT id,actor_id,action,reason,previous_json,next_json,created_at FROM audit_events WHERE entity_id=? ORDER BY created_at,id").bind(id).all()).results};}
export async function closureView(db:D1Database,id:string|null){
 const routes=await dispatches(db);const selected=id?routes.find(r=>r.id===id)??null:routes[0]??null;
 if(id&&!selected)throw new ApiError(404,"DISPATCH_NOT_FOUND","No se encontró el recorrido.");
 if(!selected)return{dispatches:routes,selected:null,workers:[],cash_total:0,transfer_total:0,inventory:[],transfers:[],closure:null};
 const workers=(await db.prepare("SELECT u.id,u.name,w.pending_sync_confirmed_at IS NOT NULL sync_confirmed,COALESCE(SUM(CASE WHEN m.payment_method='CASH' THEN m.payment_amount ELSE 0 END),0) cash_total,COALESCE(SUM(CASE WHEN m.payment_method='TRANSFER' THEN m.payment_amount ELSE 0 END),0) transfer_total,COUNT(CASE WHEN m.payment_method='TRANSFER' THEN 1 END) transfer_count FROM dispatch_workers w JOIN users u ON u.id=w.worker_user_id LEFT JOIN ledger_movements m ON m.dispatch_id=w.dispatch_id AND m.worker_user_id=w.worker_user_id AND m.movement_type='VISIT' WHERE w.dispatch_id=? GROUP BY u.id").bind(selected.id).all<{id:string;name:string;cash_total:number;transfer_total:number;transfer_count:number;sync_confirmed:number}>()).results;
 const transferRows=(await db.prepare("SELECT m.id,m.client_id,m.dispatch_id,m.worker_user_id,m.movement_type,m.previous_balance,m.payment_amount,m.payment_method,m.transfer_status,m.charge_amount,m.adjustment_amount,m.new_balance,m.reason,m.created_at,m.client_sequence,r.id receipt_id,c.name client_name,u.name worker_name FROM ledger_movements m JOIN clients c ON c.id=m.client_id JOIN users u ON u.id=m.worker_user_id LEFT JOIN receipts r ON r.movement_id=m.id WHERE m.dispatch_id=? AND m.payment_method='TRANSFER' ORDER BY m.created_at,m.id").bind(selected.id).all()).results;
 const closure=await db.prepare("SELECT dispatch_id,expected_cash,received_cash,reason,created_at FROM dispatch_closures WHERE dispatch_id=?").bind(selected.id).first();
 const returns=(await db.prepare("SELECT product_id,expected_qty,received_qty FROM dispatch_returns WHERE dispatch_id=?").bind(selected.id).all()).results;
 return{dispatches:routes,selected,workers:workers.map(w=>({...w,sync_confirmed:!!w.sync_confirmed})),cash_total:workers.reduce((s,w)=>s+w.cash_total,0),transfer_total:workers.reduce((s,w)=>s+w.transfer_total,0),inventory:selected.inventory,transfers:transferRows.map(m=>({...m,items:[]})),closure:closure?{...closure,returns}:null};
}
