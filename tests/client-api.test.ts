import {afterEach,describe,expect,it,vi} from "vitest";
const auth=vi.hoisted(()=>({ready:vi.fn(),token:vi.fn(),init:vi.fn()}));
vi.mock("../src/lib/auth/client",()=>({getFirebaseAuth:()=>auth.init()}));
import {api} from "../src/lib/client-api";
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe("session renewal isolation",()=>{
 it("rejects private requests when Firebase has no signed-in user instead of using an old cookie",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({user:{firebaseUid:"previous-user"}}));vi.stubGlobal("fetch",fetch);
  auth.init.mockReturnValue({authStateReady:auth.ready,currentUser:null});auth.ready.mockResolvedValue(undefined);
  await expect(api("/api/admin/inventario")).rejects.toMatchObject({status:401,code:"AUTH_REQUIRED"});expect(fetch).not.toHaveBeenCalled();
 });
 it("preserves cookie requests while public Firebase configuration is intentionally absent",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({user:{firebaseUid:"cookie-user"}}));vi.stubGlobal("fetch",fetch);
  auth.init.mockImplementation(()=>{throw new Error("Configura las variables públicas de Firebase para iniciar sesión.");});
  await expect(api("/api/auth/session")).resolves.toEqual({user:{firebaseUid:"cookie-user"}});
  expect(fetch).toHaveBeenCalledWith("/api/auth/session",expect.objectContaining({credentials:"same-origin"}));
 });
 it("never falls back to a previous account cookie after Firebase renewal fails",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  auth.init.mockReturnValue({authStateReady:auth.ready,currentUser:{uid:"new-user",getIdToken:auth.token}});auth.ready.mockResolvedValue(undefined);auth.token.mockRejectedValue(new Error("Network token renewal failed"));
  await expect(api("/api/admin/inventario")).rejects.toMatchObject({status:401,code:"AUTH_REFRESH_FAILED"});expect(fetch).not.toHaveBeenCalled();
 });
});
