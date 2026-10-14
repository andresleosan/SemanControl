"use client";
import { useEffect, useState } from "react";
import { getFirebaseAuth } from "./auth/client";
import { onAuthStateChanged } from "firebase/auth";
import type { Principal } from "./auth/types";

export class ClientApiError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
let cookieToken="";
async function authorization():Promise<string|null>{
  let auth:ReturnType<typeof getFirebaseAuth>;
  try {auth=getFirebaseAuth();}catch(error){
    if(error instanceof Error&&error.message==="Configura las variables públicas de Firebase para iniciar sesión.")return null;
    throw new ClientApiError(401,"AUTH_REFRESH_FAILED","No pudimos renovar tu sesión. Vuelve a iniciar sesión.");
  }
  try {
    await auth.authStateReady();
    const user=auth.currentUser;
    if(!user)throw new ClientApiError(401,"AUTH_REQUIRED","Inicia sesión para continuar.");
    const token=await user.getIdToken();
    if(token!==cookieToken){
      const response=await fetch("/api/auth/session",{method:"POST",headers:{Authorization:`Bearer ${token}`},credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new ClientApiError(response.status,"SESSION_REQUIRED","Tu acceso necesita revisión. Vuelve a iniciar sesión.");
      cookieToken=token;
    }
    return token;
  }catch(error){if(error instanceof ClientApiError)throw error;throw new ClientApiError(401,"AUTH_REFRESH_FAILED","No pudimos renovar tu sesión. Conservamos tus pendientes; vuelve a iniciar sesión.");}
}
async function request(path:string,options:RequestInit={}):Promise<Response>{
  const token=await authorization();const headers=new Headers(options.headers);
  if(token)headers.set("Authorization",`Bearer ${token}`);
  if(typeof options.body==="string"&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const response=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"});
  if(!response.ok){
    const body=await response.json().catch(()=>null) as {error?:{code?:string;message?:string}}|null;
    throw new ClientApiError(response.status,body?.error?.code??"REQUEST_FAILED",body?.error?.message??"No se pudo completar la operación.");
  }
  return response;
}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{return (await request(path,options)).json();}
export async function apiBlob(path:string,options:RequestInit={}):Promise<Blob>{return (await request(path,options)).blob();}
export function useSession(){
  const [state,setState]=useState<{user:Principal|null;loading:boolean;error:string|null}>({user:null,loading:true,error:null});
  useEffect(()=>{
    let alive=true,version=0;
    function load(uid?:string){const current=++version;setState({user:null,loading:true,error:null});api<{user:Principal}>("/api/auth/session").then(data=>{if(alive&&current===version&&(!uid||data.user.firebaseUid===uid))setState({user:data.user,loading:false,error:null});}).catch(error=>{if(alive&&current===version)setState({user:null,loading:false,error:error instanceof Error?error.message:"Inicia sesión para continuar."});});}
    let unsubscribe=()=>{};
    try {unsubscribe=onAuthStateChanged(getFirebaseAuth(),user=>{cookieToken="";if(user)load(user.uid);else {version++;setState({user:null,loading:false,error:"Inicia sesión para continuar."});}});}catch{load();}
    return()=>{alive=false;version++;unsubscribe();};
  },[]);
  return state;
}
