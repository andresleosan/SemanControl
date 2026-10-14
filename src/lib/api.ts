import "server-only";
import { authenticate } from "./auth/server";
import { requireRole } from "./auth/principal";
import type { Principal, Role } from "./auth/types";
import { getEnv } from "./cloudflare";
import { ApiError, errorResponse } from "./security/errors";
import { safeJsonResponse } from "./security/products";

export function assertOrigin(request: Request, env: Pick<CloudflareEnv,"APP_ORIGIN">) {
  let origin: URL;
  try {
    origin=new URL(env.APP_ORIGIN);
    if (!/^https?:$/.test(origin.protocol)||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash) throw new Error();
  } catch { throw new ApiError(503,"APP_NOT_CONFIGURED","El origen de la aplicación no está configurado."); }
  if (request.headers.get("Origin")!==origin.origin) throw new ApiError(403,"ORIGIN_FORBIDDEN","La solicitud debe proceder del mismo sitio.");
}
export function createApiRoute(environment:()=>Promise<CloudflareEnv>, auth:(request:Request,env:CloudflareEnv)=>Promise<Principal>) {
  return async (request:Request,roles:readonly Role[],action:(env:CloudflareEnv,principal:Principal)=>Promise<unknown>):Promise<Response>=>{
    try {
      const env=await environment();
      if (!["GET","HEAD"].includes(request.method)) assertOrigin(request,env);
      const principal=await auth(request,env);
      requireRole(principal,roles);
      if (!["GET","HEAD"].includes(request.method)) {
        const rate=await env.AUTH_RATE_LIMITER.limit({key:`operation:${principal.firebaseUid}`});
        if (!rate.success) throw new ApiError(429,"RATE_LIMITED","Espera un momento antes de volver a intentar.");
      }
      const result=await action(env,principal);
      const response=result instanceof Response ? result : safeJsonResponse(result,principal,new URL(request.url).pathname);
      response.headers.set("Cache-Control","no-store");
      response.headers.set("Vary","Cookie, Authorization");
      response.headers.set("X-Content-Type-Options","nosniff");
      return response;
    } catch(error) { return errorResponse(error); }
  };
}
export const apiRoute=createApiRoute(getEnv,authenticate);
export async function readJson(request:Request):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();
  if(!reader) throw new ApiError(400,"INVALID_BODY","Envía los datos de la operación.");
  const chunks:Uint8Array[]=[];let length=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw new ApiError(413,"BODY_TOO_LARGE","La solicitud es demasiado grande.");}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!body||typeof body!=="object"||Array.isArray(body)) throw new Error();
    return body as Record<string,unknown>;
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,"INVALID_BODY","Los datos de la operación no son válidos.");}
}
export function text(value:unknown,label:string,max=240):string {
  if(typeof value!=="string"||!value.trim()||value.trim().length>max) throw new ApiError(400,"INVALID_FIELD",`Revisa ${label}.`);
  return value.trim();
}
export function integer(value:unknown,label:string,min=0,max=1_000_000_000):number {
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)throw new ApiError(400,"INVALID_FIELD",`Revisa ${label}.`);
  return value;
}
export function email(value:unknown):string|null {
  if(value===null||value===undefined||value==="")return null;
  const result=text(value,"el correo",254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new ApiError(400,"INVALID_EMAIL","Revisa el correo Google.");
  return result;
}
export function uuid(value:unknown):string {
  if(typeof value!=="string"||!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value))throw new ApiError(400,"INVALID_UUID","La clave de la operación no es válida.");
  return value.toLowerCase();
}
