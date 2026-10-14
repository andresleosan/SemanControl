import {apiRoute,readJson} from "@/lib/api";
import {saveProduct} from "@/lib/admin/write-model";
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>saveProduct(env.DB,p,await readJson(request)));}
