import {apiRoute,readJson} from "@/lib/api";
import {clientsView} from "@/lib/admin/read-model";
import {saveClient} from "@/lib/admin/write-model";
export function GET(request:Request){return apiRoute(request,["ADMIN"],async(env)=>clientsView(env.DB,new URL(request.url).searchParams));}
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>saveClient(env.DB,p,await readJson(request)));}
