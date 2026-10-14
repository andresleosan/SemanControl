import {getEnv} from "@/lib/cloudflare";
import {assertOrigin,readJson} from "@/lib/api";
import {readSessionToken} from "@/lib/auth/server";
import {verifyFirebaseToken} from "@/lib/auth/verify-token";
import {createSessionHandlers} from "@/lib/auth/session";
import {consumeLink} from "@/lib/linking";
import {ApiError,errorResponse} from "@/lib/security/errors";
export async function POST(request:Request){try{const env=await getEnv();assertOrigin(request,env);const identity=await verifyFirebaseToken(readSessionToken(request,true),env.FIREBASE_PROJECT_ID);const rate=await env.AUTH_RATE_LIMITER.limit({key:`link:${identity.uid}`});if(!rate.success)throw new ApiError(429,"RATE_LIMITED","Espera un momento antes de volver a intentar.");const body=await readJson(request);await consumeLink(env.DB,identity,body.token);return createSessionHandlers(async()=>env).POST(request);}catch(error){return errorResponse(error);}}
