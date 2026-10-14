import { afterEach,beforeEach,describe,expect,it } from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {readFile} from "node:fs/promises";
import {adjustBalance,changeStock,closeDispatch,createDispatch,decideTransfer,saveClient,saveProduct,saveWorker} from "../src/lib/admin/write-model";
import {clientsView,dispatches} from "../src/lib/admin/read-model";
import {reportIncident,resolveIncident} from "../src/lib/incidents";
let mf:Miniflare;let db:D1Database;
const admin={userId:"admin-demo",firebaseUid:"a",email:"admin@semancontrol.example",name:"Admin",role:"ADMIN" as const,clientId:null};
const route="route-demo-2026-10-16";
async function migrate(sql:string){let statement="",trigger=false;for(const line of sql.split("\n")){if(!statement&&(!line.trim()||line.trim().startsWith("--")))continue;statement+=line+"\n";if(/CREATE TRIGGER/i.test(statement))trigger=true;if((!trigger&&/;\s*$/.test(line))||(trigger&&/^END;\s*$/i.test(line.trim()))){await db.prepare(statement).run();statement="";trigger=false;}}}
beforeEach(async()=>{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('ok')}}",compatibilityDate:"2026-10-14",d1Databases:["DB"],r2Buckets:["RECEIPTS_BUCKET"]}));db=await mf.getD1Database("DB") as unknown as D1Database;for(const file of ["migrations/0001_init.sql","migrations/0002_operations.sql","migrations/0003_incidents.sql","seed.sql"])await migrate(await readFile(new URL(`../${file}`,import.meta.url),"utf8"));});
afterEach(async()=>{await mf?.dispose();});
describe("audited administration",()=>{
 it("imports a physical card with an audited opening and replays creation without duplicating its balance",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),name:"Tarjeta física",address:"Casa",address_reference:"Reja azul",opening_balance:65000,reason:"Importación tarjeta de cartón"};
  const created=await saveClient(db,admin,payload);expect(await saveClient(db,admin,payload)).toEqual(created);
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id=?").bind(created.id).first()).toEqual({current_balance:65000});
  expect(await db.prepare("SELECT movement_type,adjustment_amount,new_balance FROM ledger_movements WHERE client_id=?").bind(created.id).first()).toEqual({movement_type:"OPENING",adjustment_amount:65000,new_balance:65000});
  expect((await clientsView(db,new URLSearchParams())).clients.filter(c=>c.name==="Tarjeta física")).toHaveLength(1);
 });
 it("reads route inventory with a bounded number of SQL queries as dispatch history grows",async()=>{
  for(let n=0;n<60;n++)await db.prepare("INSERT INTO route_dispatches(id,name,dispatch_date) VALUES(?,?,'2026-10-16')").bind(`history-${n}`,`Histórico ${n}`).run();
  let queries=0;const counted={prepare(sql:string){queries++;return db.prepare(sql);}} as D1Database;
  const routes=await dispatches(counted);expect(routes.length).toBe(61);expect(queries).toBeLessThanOrEqual(3);
 });
 it("rejects impossible dates, keeps an inactive product inactive and preserves a worker needed for closure",async()=>{
  await expect(createDispatch(db,admin,{name:"Ruta",dispatch_date:"2026-99-99",worker_ids:["worker-demo-1"],items:[]})).rejects.toMatchObject({status:400,code:"INVALID_DATE"});
  await expect(clientsView(db,new URLSearchParams({from:"2026-02-31"}))).rejects.toMatchObject({status:400,code:"INVALID_DATE"});
  await saveProduct(db,admin,{name:"Inactivo",cost_price:10,credit_price:20,is_active:0,reason:"Alta inactiva"});
  expect(await db.prepare("SELECT is_active FROM products WHERE name='Inactivo'").first()).toEqual({is_active:0});
  await expect(saveWorker(db,admin,{id:"worker-demo-1",name:"Worker",email:"trabajador1@semancontrol.example",is_active:0,reason:"Suspensión"})).rejects.toMatchObject({status:409});
 });
 it("keeps a late payment without reopening or applying debt twice and links an audited correction",async()=>{
  await db.prepare("UPDATE route_dispatches SET status='CLOSED' WHERE id=?").bind(route).run();
  const worker={...admin,userId:"worker-demo-1",role:"WORKER" as const};
  const bucket=await mf.getR2Bucket("RECEIPTS_BUCKET") as unknown as R2Bucket;
  const payload={idempotency_key:crypto.randomUUID(),dispatch_id:route,client_id:"client-demo-01",expected_revision:0,expected_balance:65000,payment_amount:5000,payment_method:"CASH",items:[]};
  const result=await reportIncident({DB:db,RECEIPTS_BUCKET:bucket},worker,payload);
  expect(await reportIncident({DB:db,RECEIPTS_BUCKET:bucket},worker,payload)).toEqual(result);
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id='client-demo-01'").first()).toEqual({current_balance:65000});
  await expect(resolveIncident(db,admin,{id:payload.idempotency_key,reason:"Revisado"})).rejects.toMatchObject({status:400});
  await adjustBalance(db,admin,{idempotency_key:crypto.randomUUID(),client_id:"client-demo-01",expected_revision:0,delta:-5000,reason:"Cobro tardío conciliado"});
  const adjustment=await db.prepare("SELECT id FROM ledger_movements WHERE movement_type='ADJUSTMENT'").first<{id:string}>();
  await resolveIncident(db,admin,{id:payload.idempotency_key,reason:"Cobro conciliado",adjustment_id:adjustment!.id});
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id='client-demo-01'").first()).toEqual({current_balance:60000});
 });
 it("posts a stock purchase once and protects other route reservations",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),product_id:"product-demo-1",qty:10,unit_cost_price:3500,reason:"Compra semanal"};
  await changeStock(db,admin,payload,true);await changeStock(db,admin,payload,true);
  expect(await db.prepare("SELECT total_stock,cost_price FROM products WHERE id='product-demo-1'").first()).toEqual({total_stock:110,cost_price:3500});
  await expect(changeStock(db,admin,{idempotency_key:crypto.randomUUID(),product_id:"product-demo-1",delta:-100,reason:"Ajuste físico"},false)).rejects.toMatchObject({status:409});
  expect(await db.prepare("SELECT COUNT(*) n FROM stock_events").first()).toEqual({n:1});
 });
 it("atomically reserves dispatch inventory and rejects over-allocation",async()=>{
  await expect(createDispatch(db,admin,{name:"Otra ruta",dispatch_date:"2026-10-16",worker_ids:["worker-demo-1"],items:[{product_id:"product-demo-1",qty:100}]})).rejects.toMatchObject({status:409});
  expect(await db.prepare("SELECT COUNT(*) n FROM route_dispatches").first()).toEqual({n:1});
 });
 it("adjusts balances by a ledger entry, rejects stale revision and replays",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),client_id:"client-demo-01",expected_revision:0,delta:-5000,reason:"Corrección tarjeta"};
  await adjustBalance(db,admin,payload);await adjustBalance(db,admin,payload);
  expect(await db.prepare("SELECT current_balance,revision FROM clients WHERE id='client-demo-01'").first()).toEqual({current_balance:60000,revision:1});
  await expect(adjustBalance(db,admin,{...payload,idempotency_key:crypto.randomUUID()})).rejects.toMatchObject({status:409});
 });
 it("swaps route positions safely and audits revocation of an old UID",async()=>{
  await db.prepare("UPDATE clients SET firebase_uid='old-uid' WHERE id='client-demo-01'").run();
  await saveClient(db,admin,{id:"client-demo-01",name:"Actualizado",address:"Casa",address_reference:"Reja",route_order:2,linked_email:"new@example.com",reason:"Cambio solicitado"});
  expect(await db.prepare("SELECT route_order,firebase_uid,linked_email FROM clients WHERE id='client-demo-01'").first()).toEqual({route_order:2,firebase_uid:null,linked_email:"new@example.com"});
  expect(await db.prepare("SELECT route_order FROM clients WHERE id='client-demo-02'").first()).toEqual({route_order:1});
 });
 it("closes only after synchronization, records shortage and releases reservation without doubling stock",async()=>{
  const rows=await db.prepare("SELECT product_id,remaining_qty FROM dispatch_inventory WHERE dispatch_id=?").bind(route).all<{product_id:string;remaining_qty:number}>();
  const payload={idempotency_key:crypto.randomUUID(),dispatch_id:route,received_cash:0,returns:rows.results.map(r=>({product_id:r.product_id,received_qty:r.remaining_qty-(r.product_id==='product-demo-1'?1:0)})),reason:"Una unidad faltante",returns_confirmed:true};
  await expect(closeDispatch(db,admin,payload)).rejects.toMatchObject({status:409});
  await db.prepare("UPDATE dispatch_workers SET pending_sync_confirmed_at=datetime('now') WHERE dispatch_id=?").bind(route).run();
  await closeDispatch(db,admin,payload);await closeDispatch(db,admin,payload);
  expect(await db.prepare("SELECT status FROM route_dispatches WHERE id=?").bind(route).first()).toEqual({status:"CLOSED"});
  expect(await db.prepare("SELECT total_stock FROM products WHERE id='product-demo-1'").first()).toEqual({total_stock:99});
 });
 it("verifies without deducting twice and rejects with exactly one compensating ledger entry",async()=>{
  await db.prepare("INSERT INTO ledger_movements(id,idempotency_key,client_id,dispatch_id,worker_user_id,previous_balance,payment_amount,payment_method,receipt_r2_key,transfer_status,new_balance,client_sequence,request_hash) VALUES('t','t','client-demo-01',?,'worker-demo-1',65000,10000,'TRANSFER','receipt','PENDING',55000,1,'hash')").bind(route).run();
  await db.prepare("UPDATE clients SET current_balance=55000,revision=1 WHERE id='client-demo-01'").run();
  await decideTransfer(db,admin,{idempotency_key:crypto.randomUUID(),movement_id:"t",status:"VERIFIED",reason:"Banco confirma"});
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id='client-demo-01'").first()).toEqual({current_balance:55000});
  const rejection={idempotency_key:crypto.randomUUID(),movement_id:"t",status:"REJECTED",reason:"Banco reversó"};
  await decideTransfer(db,admin,rejection);await decideTransfer(db,admin,rejection);
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id='client-demo-01'").first()).toEqual({current_balance:65000});
  expect(await db.prepare("SELECT COUNT(*) n FROM ledger_movements WHERE movement_type='TRANSFER_REVERSAL'").first()).toEqual({n:1});
 });
 it("separates unknown inherited margin rather than inferring profit from collections",async()=>{
  const view=await clientsView(db,new URLSearchParams());expect(view.estimated_margin).toBe(0);expect(view.inherited_balance).toBeGreaterThan(0);
 });
});
