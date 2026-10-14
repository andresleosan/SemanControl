import {apiRoute,readJson} from "@/lib/api";
import {listIncidents,resolveIncident} from "@/lib/incidents";
export function GET(request:Request){return apiRoute(request,["ADMIN"],async(env)=>listIncidents(env.DB,new URL(request.url).searchParams.get("dispatch_id")));}
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>resolveIncident(env.DB,p,await readJson(request)));}
