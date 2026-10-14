import {apiRoute} from "@/lib/api";
import {cleanupOrphanReceipts} from "@/lib/operations/receipts";
export function POST(request:Request){return apiRoute(request,["ADMIN"],async(env,p)=>cleanupOrphanReceipts(env,p));}
