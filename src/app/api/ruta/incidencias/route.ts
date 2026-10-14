import {apiRoute} from "@/lib/api";
import {ApiError} from "@/lib/security/errors";
import {reportIncident} from "@/lib/incidents";
export function POST(request:Request){return apiRoute(request,["WORKER"],async(env,p)=>{
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"INVALID_BODY","Envía la incidencia.");const chunks:Uint8Array[]=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>610000){await reader.cancel();throw new ApiError(413,"BODY_TOO_LARGE","La incidencia excede el tamaño permitido.");}chunks.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let form:FormData;let body:Record<string,unknown>;try{form=await new Response(bytes,{headers:{"Content-Type":request.headers.get("Content-Type")??""}}).formData();const raw=form.get("payload");if(typeof raw!=="string"||raw.length>40000)throw new Error();body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error();}catch{throw new ApiError(400,"INVALID_BODY","La incidencia no es válida.");}const photo=form.get("photo");return reportIncident(env,p,body,photo instanceof Blob?photo:undefined);
});}
