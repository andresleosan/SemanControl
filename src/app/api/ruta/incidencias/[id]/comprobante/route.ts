import {apiRoute} from "@/lib/api";
import {incidentReceipt} from "@/lib/incidents";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return apiRoute(request,["WORKER","ADMIN"],async(env,p)=>incidentReceipt(env,p,id));}
