import {apiRoute,readJson} from "@/lib/api";
import {issueLink} from "@/lib/linking";
export function POST(request:Request){return apiRoute(request,["WORKER","ADMIN"],async(env,p)=>issueLink(env.DB,p,await readJson(request),env.APP_ORIGIN));}
