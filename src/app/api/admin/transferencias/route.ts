import {apiRoute,readJson} from "@/lib/api";
import {decideTransfer} from "@/lib/admin/write-model";
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>decideTransfer(env.DB,p,await readJson(request)));}
