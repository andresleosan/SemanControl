import {apiRoute} from "@/lib/api";
import {inventoryView} from "@/lib/admin/read-model";
export function GET(request:Request){return apiRoute(request,["ADMIN"],async(env)=>inventoryView(env.DB));}
