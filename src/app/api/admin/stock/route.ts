import {apiRoute,readJson} from "@/lib/api";
import {changeStock} from "@/lib/admin/write-model";
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>changeStock(env.DB,p,await readJson(request),false));}
