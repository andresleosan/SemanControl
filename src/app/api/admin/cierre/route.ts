import {apiRoute,readJson} from "@/lib/api";
import {closureView} from "@/lib/admin/read-model";
import {closeDispatch} from "@/lib/admin/write-model";
export function GET(request:Request){return apiRoute(request,["ADMIN"],async(env)=>closureView(env.DB,new URL(request.url).searchParams.get("dispatch_id")));}
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>closeDispatch(env.DB,p,await readJson(request)));}
