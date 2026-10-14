import {apiRoute} from "@/lib/api";
import {clientRow,history} from "@/lib/admin/read-model";
import {ApiError} from "@/lib/security/errors";
export function GET(request:Request){return apiRoute(request,["CLIENT"],async(env,p)=>{if(!p.clientId)throw new ApiError(403,"CARD_REQUIRED","No tienes una tarjeta vinculada.");return{client:await clientRow(env.DB,p.clientId),history:await history(env.DB,p.clientId)};});}
