"use client";
import {useState,useSyncExternalStore} from "react";
import Link from "next/link";
import {signInWithGoogle} from "@/lib/auth/client";
import {Notice} from "@/components/ui";
import {WalletCards} from "lucide-react";
const subscribe=(notify:()=>void)=>{window.addEventListener("hashchange",notify);return()=>window.removeEventListener("hashchange",notify);};
export default function LinkPage(){const token=useSyncExternalStore(subscribe,()=>new URLSearchParams(window.location.hash.slice(1)).get("token")??"",()=>"");const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function claim(){setBusy(true);setMessage("");try{const credential=await signInWithGoogle();const response=await fetch("/api/vinculo/consumir",{method:"POST",headers:{Authorization:`Bearer ${await credential.user.getIdToken()}`,"Content-Type":"application/json"},body:JSON.stringify({token}),credentials:"same-origin"});const body=await response.json() as {error?:{message:string};redirectTo?:string};if(!response.ok)throw new Error(body.error?.message??"No se pudo vincular la tarjeta.");window.history.replaceState(null,"","/vincular");window.location.assign("/mi-cuenta");}catch(error){setMessage(error instanceof Error?error.message:"No se pudo vincular la tarjeta.");}finally{setBusy(false);}}
 return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10"><section className="sc-panel"><WalletCards className="mb-5 text-[#155f4b]" size={38}/><h1 className="mb-3 text-2xl font-bold">Vincula tu tarjeta</h1><p className="mb-6 text-[#405766]">Usa tu cuenta de Google para consultar tus abonos, productos y saldo. El vínculo vence en 10 minutos y se utiliza una sola vez.</p>{message&&<Notice tone="error">{message}</Notice>}{!token&&<Notice>Abre el enlace que te mostró el trabajador.</Notice>}<button disabled={busy||!token} className="sc-button w-full" onClick={claim}>{busy?"Vinculando…":"Continuar con Google y vincular"}</button><Link className="mt-5 block underline" href="/login">Ya tengo mi tarjeta vinculada</Link></section></main>;
}
