import {apiRoute} from "@/lib/api";
import {clientDetail} from "@/lib/admin/read-model";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return apiRoute(request,["ADMIN"],async(env)=>clientDetail(env.DB,id));}
