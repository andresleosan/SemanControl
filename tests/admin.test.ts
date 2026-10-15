import { afterEach,beforeEach,describe,expect,it } from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {readFile} from "node:fs/promises";
import {adjustBalance,changeStock,closeDispatch,createDispatch,decideTransfer,saveClient,saveProduct,saveWorker} from "../src/lib/admin/write-model";
import {clientDetail,clientsView,dispatches,inventoryView} from "../src/lib/admin/read-model";
import {reportIncident,resolveIncident} from "../src/lib/incidents";
let mf:Miniflare;let db:D1Database;
const admin={userId:"admin-demo",firebaseUid:"a",email:"admin@semancontrol.example",name:"Admin",role:"ADMIN" as const,clientId:null};
const route="route-demo-2026-10-16";
async function migrate(sql:string){let statement="",trigger=false;for(const line of sql.split("\n")){if(!statement&&(!line.trim()||line.trim().startsWith("--")))continue;statement+=line+"\n";if(/CREATE TRIGGER/i.test(statement))trigger=true;if((!trigger&&/;\s*$/.test(line))||(trigger&&/^END;\s*$/i.test(line.trim()))){await db.prepare(statement).run();statement="";trigger=false;}}}
beforeEach(async()=>{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('ok')}}",compatibilityDate:"2026-10-14",d1Databases:["DB"],r2Buckets:["RECEIPTS_BUCKET"]}));db=await mf.getD1Database("DB") as unknown as D1Database;for(const file of ["migrations/0001_init.sql","migrations/0002_operations.sql","migrations/0003_incidents.sql","migrations/0004_product_categories.sql","migrations/0005_opening_items.sql","seed.sql"])await migrate(await readFile(new URL(`../${file}`,import.meta.url),"utf8"));});
afterEach(async()=>{await mf?.dispose();});
describe("audited administration",()=>{
 it("saves products without asking for a reason and records the actor and changes",async()=>{
  await saveProduct(db,admin,{name:"Natural",category_name:"Yogurt",cost_price:12000,credit_price:18000});
  const product=await db.prepare("SELECT id FROM products WHERE name='Natural'").first<{id:string}>();
  await saveProduct(db,admin,{id:product!.id,name:"Natural",cost_price:12500,credit_price:18000,reason:"  "});
  const audit=await db.prepare("SELECT actor_id,reason,previous_json,next_json FROM audit_events WHERE entity_id=? ORDER BY created_at,id").bind(product!.id).all<{actor_id:string;reason:string;previous_json:string;next_json:string}>();
  expect(audit.results).toHaveLength(2);
  expect(audit.results.every(row=>row.actor_id===admin.userId&&row.reason.trim().length>0)).toBe(true);
  expect(audit.results.map(row=>JSON.parse(row.next_json).cost_price).sort()).toEqual([12000,12500]);
  expect(audit.results.some(row=>JSON.parse(row.previous_json)?.cost_price===12000)).toBe(true);
 });
 it("shares categories without splitting legacy inventory and keeps flavor stock and prices independent",async()=>{
  await saveProduct(db,admin,{name:"Fresa",category_name:" Yogurt ",cost_price:12000,credit_price:18000,reason:"Alta"});
  await saveProduct(db,admin,{name:"Mora",category_name:"yogurt",cost_price:10000,credit_price:16000,reason:"Alta"});
  const first=(await inventoryView(db)).products;
  const fresa=first.find(row=>row.name==="Yogurt · Fresa")!,mora=first.find(row=>row.name==="Yogurt · Mora")!;
  expect(fresa).toMatchObject({variant_name:"Fresa",category_name:"Yogurt",total_stock:0,available_stock:0,reserved_stock:0,cost_price:12000,credit_price:18000});
  expect(fresa.category_id).toBeTruthy();expect(mora.category_id).toBe(fresa.category_id);
  expect(await db.prepare("SELECT COUNT(*) n FROM product_categories").first()).toEqual({n:1});
  const purchase={idempotency_key:crypto.randomUUID(),product_id:fresa.id,qty:10,unit_cost_price:12500,reason:"Ingreso de bodega"};
  await changeStock(db,admin,purchase,true);await changeStock(db,admin,purchase,true);
  await createDispatch(db,admin,{name:"Ruta sabores",dispatch_date:"2026-10-17",worker_ids:["worker-demo-1"],items:[{product_id:fresa.id,qty:3}]});
  const final=(await inventoryView(db)).products;
  expect(final.find(row=>row.id===fresa.id)).toMatchObject({total_stock:10,available_stock:7,reserved_stock:3,cost_price:12500,credit_price:18000});
  expect(final.find(row=>row.id===mora.id)).toMatchObject({total_stock:0,available_stock:0,reserved_stock:0,cost_price:10000,credit_price:16000});
  expect(final.find(row=>row.id==="product-demo-1")).toMatchObject({category_id:null,category_name:null,total_stock:100,available_stock:70,reserved_stock:30});
 });
 it("rejects duplicate flavors atomically and preserves or clears a category only as requested",async()=>{
  await saveProduct(db,admin,{name:"Fresa",category_name:"Yogurt",cost_price:12000,credit_price:18000,reason:"Alta"});
  await expect(saveProduct(db,admin,{name:" fRESA ",category_name:"YOGURT",cost_price:1,credit_price:2,reason:"Duplicado"})).rejects.toMatchObject({status:409});
  const fresa=(await inventoryView(db)).products.find(row=>row.variant_name==="Fresa")!;
  await saveProduct(db,admin,{id:fresa.id,name:"Fresa grande",cost_price:13000,credit_price:19000,reason:"Editar"});
  expect((await inventoryView(db)).products.find(row=>row.id===fresa.id)).toMatchObject({name:"Yogurt · Fresa grande",category_id:fresa.category_id});
  await saveProduct(db,admin,{id:fresa.id,name:"Fresa grande",category_name:null,cost_price:13000,credit_price:19000,reason:"Separar"});
  expect((await inventoryView(db)).products.find(row=>row.id===fresa.id)).toMatchObject({name:"Fresa grande",category_id:null,category_name:null});
  expect(await db.prepare("SELECT COUNT(*) n FROM products WHERE name LIKE 'Fresa%'").first()).toEqual({n:1});
  expect(await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='PRODUCT_SAVE'").first()).toEqual({n:3});
 });
 it("validates category and optional reason types instead of silently accepting malformed fields",async()=>{
  for(const extra of [{category_name:1},{category_name:"x".repeat(141)},{reason:42}])await expect(saveProduct(db,admin,{name:"Producto",cost_price:1,credit_price:2,...extra})).rejects.toMatchObject({status:400});
  expect(await db.prepare("SELECT COUNT(*) n FROM products").first()).toEqual({n:5});
 });
 it("adds warehouse stock while saving and replays the original creation after later metadata changes",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),name:"Fresa",category_name:"Yogurt",cost_price:12000,credit_price:18000,stock_qty:12};
  await saveProduct(db,admin,payload);await saveProduct(db,admin,payload);
  const fresa=(await inventoryView(db)).products.find(row=>row.name==="Yogurt · Fresa")!;
  expect(fresa).toMatchObject({total_stock:12,available_stock:12,reserved_stock:0});
  await createDispatch(db,admin,{name:"Ruta sabores",dispatch_date:"2026-10-17",worker_ids:["worker-demo-1"],items:[{product_id:fresa.id,qty:3}]});
  const edit={idempotency_key:crypto.randomUUID(),id:fresa.id,name:"Fresa",cost_price:13000,credit_price:19000,stock_qty:5};
  await saveProduct(db,admin,edit);await saveProduct(db,admin,edit);await saveProduct(db,admin,payload);
  expect((await inventoryView(db)).products.find(row=>row.id===fresa.id)).toMatchObject({total_stock:17,available_stock:14,reserved_stock:3,cost_price:13000,credit_price:19000});
  expect(await db.prepare("SELECT COUNT(*) n FROM stock_events WHERE product_id=?").bind(fresa.id).first()).toEqual({n:2});
  expect(await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='PRODUCT_SAVE' AND entity_id=?").bind(fresa.id).first()).toEqual({n:2});
  await expect(saveProduct(db,admin,{...edit,stock_qty:6})).rejects.toMatchObject({status:409,code:"IDEMPOTENCY_CONFLICT"});
 });
 it("requires idempotency for stock ingress and validates quantities without changing existing stock",async()=>{
  for(const stock_qty of [-1,1.5,1_000_001,"2",null])await expect(saveProduct(db,admin,{name:"Producto",cost_price:1,credit_price:2,stock_qty})).rejects.toMatchObject({status:400});
  await expect(saveProduct(db,admin,{name:"Producto",cost_price:1,credit_price:2,stock_qty:1})).rejects.toMatchObject({status:400});
  expect(await db.prepare("SELECT COUNT(*) n FROM products").first()).toEqual({n:5});
 });
 it("rolls back category creation and warehouse ingress when product metadata changes before the batch",async()=>{
  const raced={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){
   await db.prepare("UPDATE products SET credit_price=5500 WHERE id='product-demo-1'").run();
   return db.batch(statements);
  }} as unknown as D1Database;
  await expect(saveProduct(raced,admin,{idempotency_key:crypto.randomUUID(),id:"product-demo-1",name:"Fresa",category_name:"Yogurt",cost_price:12000,credit_price:18000,stock_qty:5})).rejects.toMatchObject({status:409});
  expect(await db.prepare("SELECT total_stock,cost_price,credit_price,category_id FROM products WHERE id='product-demo-1'").first()).toEqual({total_stock:100,cost_price:3200,credit_price:5500,category_id:null});
  expect(await db.prepare("SELECT COUNT(*) n FROM product_categories").first()).toEqual({n:0});
  expect(await db.prepare("SELECT COUNT(*) n FROM stock_events").first()).toEqual({n:0});
  expect(await db.prepare("SELECT COUNT(*) n FROM operation_requests").first()).toEqual({n:0});
 });
 it("audits the exact stock transition when a route delivery happens before a warehouse ingress batch",async()=>{
  const raced={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){
   await db.batch([
    db.prepare("UPDATE dispatch_inventory SET remaining_qty=remaining_qty-2 WHERE product_id='product-demo-1'"),
    db.prepare("UPDATE products SET total_stock=total_stock-2 WHERE id='product-demo-1'"),
   ]);
   return db.batch(statements);
  }} as unknown as D1Database;
  await saveProduct(raced,admin,{idempotency_key:crypto.randomUUID(),id:"product-demo-1",name:"Producto",cost_price:3200,credit_price:5000,stock_qty:5});
  const audit=await db.prepare("SELECT previous_json,next_json FROM audit_events WHERE entity_id='product-demo-1' AND action='PRODUCT_SAVE'").first<{previous_json:string;next_json:string}>();
  expect(JSON.parse(audit!.previous_json)).not.toHaveProperty("total_stock");
  expect(JSON.parse(audit!.previous_json)).toMatchObject({cost_price:3200,credit_price:5000});
  expect(JSON.parse(audit!.next_json)).toMatchObject({total_stock:103,stock_qty:5});
  expect(await db.prepare("SELECT delta,previous_stock,new_stock FROM stock_events WHERE product_id='product-demo-1'").first()).toEqual({delta:5,previous_stock:98,new_stock:103});
 });
 it("imports a physical card with an audited opening and replays creation without duplicating its balance",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),name:"Tarjeta física",address:"Casa",address_reference:"Reja azul",opening_balance:65000,reason:"Importación tarjeta de cartón"};
  const created=await saveClient(db,admin,payload);expect(await saveClient(db,admin,payload)).toEqual(created);
  expect(await db.prepare("SELECT current_balance FROM clients WHERE id=?").bind(created.id).first()).toEqual({current_balance:65000});
  expect(await db.prepare("SELECT movement_type,adjustment_amount,new_balance FROM ledger_movements WHERE client_id=?").bind(created.id).first()).toEqual({movement_type:"OPENING",adjustment_amount:65000,new_balance:65000});
  expect((await clientsView(db,new URLSearchParams())).clients.filter(c=>c.name==="Tarjeta física")).toHaveLength(1);
 });
 it("imports products already owed using historical prices without changing warehouse, route stock or margin",async()=>{
  await saveProduct(db,admin,{id:"product-demo-1",name:"Fresa",category_name:"Yogurt",cost_price:12000,credit_price:18000,is_active:0});
  const before=await inventoryView(db),portfolio=await clientsView(db,new URLSearchParams());
  const created=await saveClient(db,admin,{idempotency_key:crypto.randomUUID(),name:"Deuda anterior",address:"Casa",address_reference:"Reja",opening_items:[{product_id:"product-demo-1",qty:2,unit_credit_price:17000},{product_id:"product-demo-2",qty:1,unit_credit_price:4000}]});
  const detail=await clientDetail(db,created.id);
  expect(detail.client).toMatchObject({current_balance:38000,revision:1});
  expect(detail.history).toHaveLength(1);
  expect(detail.history[0]).toMatchObject({movement_type:"OPENING",previous_balance:0,charge_amount:0,adjustment_amount:38000,new_balance:38000,reason:"Tarjeta creada"});
  expect(detail.history[0].items).toEqual(expect.arrayContaining([{product_id:"product-demo-1",product_name_snapshot:"Yogurt · Fresa",qty:2,unit_credit_price:17000,subtotal:34000}]));
  expect(detail.history[0].items).toHaveLength(2);
  expect(await inventoryView(db)).toEqual(before);
  expect(await db.prepare("SELECT COUNT(*) n FROM stock_events").first()).toEqual({n:0});
  expect((await clientsView(db,new URLSearchParams())).estimated_margin).toBe(portfolio.estimated_margin);
  expect(await db.prepare("SELECT COUNT(*) n FROM movement_items").first()).toEqual({n:0});
 });
 it("replays the original opening after catalog changes and later payments without adding debt twice",async()=>{
  const key=crypto.randomUUID(),payload={idempotency_key:key,name:"Deuda anterior",address:"Casa",address_reference:"Reja",opening_items:[{product_id:"product-demo-2",qty:1,unit_credit_price:3500},{product_id:"product-demo-1",qty:2,unit_credit_price:16000}]};
  const created=await saveClient(db,admin,payload);
  await saveProduct(db,admin,{id:"product-demo-1",name:"Nombre nuevo",category_name:"Otra",cost_price:20000,credit_price:30000,is_active:0});
  await adjustBalance(db,admin,{idempotency_key:crypto.randomUUID(),client_id:created.id,expected_revision:1,delta:-5000,reason:"Corrección"});
  expect(await saveClient(db,admin,{...payload,opening_items:[...payload.opening_items].reverse()})).toEqual(created);
  const detail=await clientDetail(db,created.id);
  expect(detail.client.current_balance).toBe(30500);
  expect(detail.history[0].items.find(item=>item.product_id==="product-demo-1")).toMatchObject({product_name_snapshot:expect.not.stringContaining("Nombre nuevo"),qty:2,unit_credit_price:16000,subtotal:32000});
  expect(await db.prepare("SELECT COUNT(*) n FROM opening_items").first()).toEqual({n:2});
  await expect(saveClient(db,admin,{...payload,opening_items:[{product_id:"product-demo-1",qty:3,unit_credit_price:16000}]})).rejects.toMatchObject({status:409,code:"IDEMPOTENCY_CONFLICT"});
 });
 it("commits exactly one card and its product debt when creation retries race",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),name:"Respuesta perdida",address:"Casa",address_reference:"Reja",opening_items:[{product_id:"product-demo-1",qty:1,unit_credit_price:18000}]};
  const [first,second]=await Promise.all([saveClient(db,admin,payload),saveClient(db,admin,payload)]);
  expect(second).toEqual(first);
  expect(await db.prepare("SELECT COUNT(*) n FROM clients WHERE name=?").bind(payload.name).first()).toEqual({n:1});
  expect(await db.prepare("SELECT COUNT(*) n FROM opening_items").first()).toEqual({n:1});
  expect((await clientDetail(db,first.id)).client.current_balance).toBe(18000);
 });
 it("uses automatic card audit notes and preserves manual openings including credit balances",async()=>{
  const created=await saveClient(db,admin,{idempotency_key:crypto.randomUUID(),name:"Saldo a favor",address:"Casa",address_reference:"Reja",opening_balance:-5000,opening_items:[]});
  await saveClient(db,admin,{id:created.id,name:"Nombre actualizado",address:"Casa",address_reference:"Reja",reason:"  "});
  const detail=await clientDetail(db,created.id);
  expect(detail.client.current_balance).toBe(-5000);
  expect(detail.history[0].items).toEqual([]);
  expect(detail.audit.map(row=>row.reason)).toEqual(expect.arrayContaining(["Tarjeta creada","Tarjeta actualizada"]));
 });
 it("honors an optional idempotency key for metadata edits after the card order later changes",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),id:"client-demo-01",name:"Nombre actualizado",address:"Casa",address_reference:"Reja"};
  const first=await saveClient(db,admin,payload);
  await saveClient(db,admin,{...payload,idempotency_key:crypto.randomUUID(),route_order:2,name:"Cambio posterior"});
  expect(await saveClient(db,admin,payload)).toEqual(first);
  expect((await clientDetail(db,payload.id)).client).toMatchObject({route_order:2,name:"Cambio posterior"});
 });
 it("accepts zero-valued product debt and rejects a sum above the supported money limit",async()=>{
  const base={idempotency_key:crypto.randomUUID(),name:"Sin importe",address:"Casa",address_reference:"Reja"};
  const created=await saveClient(db,admin,{...base,opening_items:[{product_id:"product-demo-1",qty:1,unit_credit_price:0}]});
  const detail=await clientDetail(db,created.id);
  expect(detail.client.current_balance).toBe(0);
  expect(detail.history[0].items).toHaveLength(1);
  await expect(saveClient(db,admin,{...base,idempotency_key:crypto.randomUUID(),opening_items:[{product_id:"product-demo-1",qty:1,unit_credit_price:600000000},{product_id:"product-demo-2",qty:1,unit_credit_price:600000000}]})).rejects.toMatchObject({status:400});
 });
 it("rejects ambiguous openings, editing initial debt and invalid product lines",async()=>{
  const base={idempotency_key:crypto.randomUUID(),name:"Cliente",address:"Casa",address_reference:"Reja",reason:"Alta"},item={product_id:"product-demo-1",qty:1,unit_credit_price:18000};
  await expect(saveClient(db,admin,{...base,opening_items:[item],opening_balance:0})).rejects.toMatchObject({status:400,code:"AMBIGUOUS_OPENING"});
  for(const opening_items of [null,{},[null],[{...item,qty:0}],[{...item,qty:1.5}],[{...item,qty:100001}],[{...item,unit_credit_price:-1}],[{...item,unit_credit_price:"18000"}],[{...item,qty:100000,unit_credit_price:1000000000}],[item,item],Array.from({length:51},(_,i)=>({...item,product_id:`p${i}`}))]){
   await expect(saveClient(db,admin,{...base,opening_items})).rejects.toMatchObject({status:400});
  }
  await expect(saveClient(db,admin,{id:"client-demo-01",name:"Cliente",address:"Casa",address_reference:"Reja",reason:"Editar",opening_items:[]})).rejects.toMatchObject({status:400,code:"OPENING_ONLY_ON_CREATE"});
  await expect(saveClient(db,admin,{...base,idempotency_key:undefined,opening_items:[item]})).rejects.toMatchObject({status:400});
  expect(await db.prepare("SELECT COUNT(*) n FROM clients").first()).toEqual({n:10});
 });
 it("rolls back the complete card import if any historical product does not exist",async()=>{
  const payload={idempotency_key:crypto.randomUUID(),name:"No debe guardarse",address:"Casa",address_reference:"Reja",reason:"Alta",opening_items:[{product_id:"product-demo-1",qty:1,unit_credit_price:18000},{product_id:"missing",qty:1,unit_credit_price:18000}]};
  await expect(saveClient(db,admin,payload)).rejects.toMatchObject({status:409});
  expect(await db.prepare("SELECT COUNT(*) n FROM clients").first()).toEqual({n:10});
  expect(await db.prepare("SELECT COUNT(*) n FROM operation_requests WHERE idempotency_key=?").bind(payload.idempotency_key).first()).toEqual({n:0});
  expect(await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='CLIENT_SAVE'").first()).toEqual({n:0});
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
