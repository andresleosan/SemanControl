import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {readFile} from "node:fs/promises";
import {consumeLink,issueLink} from "../src/lib/linking";
import {saveClient} from "../src/lib/admin/write-model";
let mf:Miniflare;let db:D1Database;
const worker={userId:"worker-demo-1",firebaseUid:"w",email:"trabajador1@semancontrol.example",name:"Worker",role:"WORKER" as const,clientId:null};
const identity={uid:"new-client",email:"customer@example.com",name:"Customer",expiresAt:4102444800,issuedAt:1,authTime:1};
async function migrate(sql:string){let s="",trigger=false;for(const line of sql.split("\n")){if(!s&&(!line.trim()||line.trim().startsWith("--")))continue;s+=line+"\n";if(/CREATE TRIGGER/i.test(s))trigger=true;if((!trigger&&/;\s*$/.test(line))||(trigger&&/^END;\s*$/i.test(line.trim()))){await db.prepare(s).run();s="";trigger=false;}}}
beforeEach(async()=>{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('ok')}}",compatibilityDate:"2026-10-14",d1Databases:["DB"]}));db=await mf.getD1Database("DB") as unknown as D1Database;for(const file of ["migrations/0001_init.sql","migrations/0002_operations.sql","seed.sql"])await migrate(await readFile(new URL(`../${file}`,import.meta.url),"utf8"));await db.prepare("UPDATE clients SET linked_email=NULL WHERE id='client-demo-01'").run();});
afterEach(async()=>{await mf?.dispose();});
describe("single-use signed customer linking",()=>{
 it("invalidates unused links when ADMIN revokes a card account",async()=>{
  const link=await issueLink(db,worker,{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16"},"http://localhost:3000");const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get("token")!;
  await db.prepare("UPDATE clients SET firebase_uid='old-user',linked_email='old@example.com' WHERE id='client-demo-01'").run();
  await saveClient(db,{...worker,userId:"admin-demo",role:"ADMIN"},{id:"client-demo-01",name:"Cliente",address:"Casa",address_reference:"Reja",linked_email:null,reason:"Revocación de cuenta"});
  await expect(consumeLink(db,identity,token)).rejects.toMatchObject({status:409});
  expect(await db.prepare("SELECT firebase_uid FROM clients WHERE id='client-demo-01'").first()).toEqual({firebase_uid:null});
 });
 it("claims an unlinked card atomically, consumes token and prevents replacement",async()=>{
  const link=await issueLink(db,worker,{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16"},"http://localhost:3000");
  const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get("token")!;
  await consumeLink(db,identity,token);
  expect(await db.prepare("SELECT firebase_uid,linked_email FROM clients WHERE id='client-demo-01'").first()).toEqual({firebase_uid:identity.uid,linked_email:identity.email});
  await expect(consumeLink(db,{...identity,uid:"intruder"},token)).rejects.toMatchObject({status:409});
  await expect(issueLink(db,worker,{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16"},"http://localhost:3000")).rejects.toMatchObject({status:409});
 });
 it("rejects tampering, expired database tokens and an email different from preauthorization",async()=>{
  const link=await issueLink(db,worker,{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16",linked_email:"expected@example.com"},"http://localhost:3000");
  const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get("token")!;
  await expect(consumeLink(db,identity,token)).rejects.toMatchObject({status:409});
  await expect(consumeLink(db,identity,token.slice(0,-1)+"! ")).rejects.toMatchObject({status:400});
  await db.prepare("UPDATE link_tokens SET expires_at='2000-01-01T00:00:00.000Z'").run();
  await expect(consumeLink(db,{...identity,email:"expected@example.com"},token)).rejects.toMatchObject({status:409});
 });
 it("refuses a privileged Google account and an unassigned worker",async()=>{
  await expect(issueLink(db,{...worker,userId:"wrong"},{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16"},"http://localhost:3000")).rejects.toMatchObject({status:403});
  const link=await issueLink(db,worker,{client_id:"client-demo-01",dispatch_id:"route-demo-2026-10-16"},"http://localhost:3000");const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get("token")!;
  await expect(consumeLink(db,{...identity,email:"admin@semancontrol.example"},token)).rejects.toMatchObject({status:409});
 });
});
