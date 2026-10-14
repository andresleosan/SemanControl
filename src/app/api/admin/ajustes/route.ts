import {apiRoute,readJson} from "@/lib/api";
import {adjustBalance} from "@/lib/admin/write-model";
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>adjustBalance(env.DB,p,await readJson(request)));}
