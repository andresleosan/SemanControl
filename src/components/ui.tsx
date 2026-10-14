"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Route, Warehouse, ClipboardCheck, Users, CreditCard, WalletCards } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Role } from "@/lib/auth/types";
import { api } from "@/lib/client-api";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/auth/client";

export function Money({value}:{value:number}){return <span className="sc-money">{new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(value)}</span>;}
export function Notice({children,tone="info"}:{children:ReactNode;tone?:"error"|"success"|"info"}){return <div role={tone==="error"?"alert":"status"} className={`sc-notice sc-notice-${tone}`}>{children}</div>;}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="sc-field"><span>{label}</span>{children}</label>;}
export function SubmitButton({children,...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="submit" {...props} className={`sc-button ${props.className??""}`}>{children}</button>;}
export function AppShell({role,children,title,subtitle}:{role:Role;children:ReactNode;title:string;subtitle?:string}){
  const path=usePathname();
  const links=role==="ADMIN"?[["/admin/cierre","Cierre",ClipboardCheck],["/admin/inventario","Bodega",Warehouse],["/admin/clientes","Tarjetas",Users]] as const:role==="WORKER"?[["/ruta","Mi ruta",Route],["/ruta/resumen","Mi cuadre",WalletCards]] as const:[["/mi-cuenta","Mi tarjeta",CreditCard]] as const;
  async function logout(){try{await api("/api/auth/session",{method:"DELETE"});try{await signOut(getFirebaseAuth());}catch{/* The server cookie is already cleared. */}window.location.assign("/login");}catch{window.location.assign("/sesion");}}
  return <div className="sc-app"><header className="sc-top"><Link href={links[0][0]} className="sc-brand"><WalletCards size={25}/><span>SemanControl<small>{role==="ADMIN"?"Control del negocio":role==="WORKER"?"Viernes en ruta":"Tu tarjeta digital"}</small></span></Link><button className="sc-icon-button" onClick={logout} aria-label="Cerrar sesión"><LogOut size={22}/></button></header><nav className="sc-nav" aria-label="Navegación principal">{links.map(([href,label,Icon])=><Link key={href} href={href} aria-current={path===href?"page":undefined}><Icon size={19}/>{label}</Link>)}</nav><main className="sc-page"><div className="sc-heading"><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{children}</main><footer className="sc-bottom">SemanControl · Cuentas claras, tarjeta por tarjeta</footer></div>;
}
