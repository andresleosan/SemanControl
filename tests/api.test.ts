import { describe, expect, it } from "vitest";
import { createApiRoute, readJson } from "../src/lib/api";
import { safeJsonResponse } from "../src/lib/security/products";
import type { Principal } from "../src/lib/auth/types";

const worker: Principal = { userId:"w",firebaseUid:"uid",email:"w@example.com",name:"Worker",role:"WORKER",clientId:null };
const env = { APP_ORIGIN:"http://localhost:3000", AUTH_RATE_LIMITER:{limit:async()=>({success:true})} } as unknown as CloudflareEnv;
describe("business API boundary",()=>{
  it("rejects foreign Origin before changing business data",async()=>{
    let changed=false;
    const route=createApiRoute(async()=>env,async()=>worker);
    const response=await route(new Request("http://internal/api/ruta/x",{method:"POST",headers:{Origin:"https://foreign.example"}}),["WORKER"],async()=>{changed=true;return{ok:true};});
    expect(response.status).toBe(403); expect(changed).toBe(false);
  });
  it("uses the trusted public origin rather than reconstructed URL",async()=>{
    const route=createApiRoute(async()=>env,async()=>worker);
    const response=await route(new Request("http://localhost/api/ruta/x",{method:"POST",headers:{Origin:env.APP_ORIGIN}}),["WORKER"],async()=>({ok:true}));
    expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("denies admin access from a worker",async()=>{
    const route=createApiRoute(async()=>env,async()=>worker);
    expect((await route(new Request("http://localhost/api/admin/x"),["ADMIN"],async()=>({ok:true}))).status).toBe(403);
  });
  it("bounds actual JSON bytes and rejects arrays",async()=>{
    await expect(readJson(new Request("http://localhost",{method:"POST",body:JSON.stringify({x:"a".repeat(70000)})}))).rejects.toMatchObject({status:413});
    await expect(readJson(new Request("http://localhost",{method:"POST",body:"[]"}))).rejects.toMatchObject({status:400});
  });
  it("does not leak historical cost snapshots",()=>{
    expect(()=>safeJsonResponse({items:[{unit_cost_price:3200}]},worker,"/api/ruta")).toThrow();
  });
});
