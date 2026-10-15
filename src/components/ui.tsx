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
export type StatusTone = "success" | "warning" | "error" | "neutral" | "info";
export function Badge({children,tone="neutral"}:{children:ReactNode;tone?:StatusTone}){return <span className={`sc-badge sc-badge-${tone}`}>{children}</span>;}
export function Notice({children,tone="info"}:{children:ReactNode;tone?:StatusTone}){return <div role={tone==="error"?"alert":"status"} className={`sc-notice sc-notice-${tone}`}>{children}</div>;}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="sc-field"><span>{label}</span>{children}</label>;}
export function SubmitButton({children,...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button type="submit" {...props} className={`sc-button ${props.className??""}`}>{children}</button>;}
export function AppShell({role,children,title,subtitle,dispatchId,hideMobileNav=false}:{role:Role;children:ReactNode;title:string;subtitle?:string;dispatchId?:string;hideMobileNav?:boolean}){
  const path=usePathname();
  const links=role==="ADMIN"?[["/admin/cierre","Cierre",ClipboardCheck],["/admin/inventario","Bodega",Warehouse],["/admin/clientes","Tarjetas",Users]] as const:role==="WORKER"?[["/ruta","Mi ruta",Route],["/ruta/clientes","Clientes",Users],["/ruta/resumen","Mi cuadre",WalletCards]] as const:[["/mi-cuenta","Mi tarjeta",CreditCard]] as const;
  const roleLabel=role==="ADMIN"?"Administración":role==="WORKER"?"Trabajo en ruta":"Mi cuenta";
  const destination=(href:string)=>role==="WORKER"&&dispatchId?`${href}?dispatch_id=${encodeURIComponent(dispatchId)}`:href;
  const active=(href:string)=>href==="/ruta"?path===href||path.startsWith("/ruta/cliente/"):path===href||path.startsWith(`${href}/`);
  async function logout(){try{await api("/api/auth/session",{method:"DELETE"});try{await signOut(getFirebaseAuth());}catch{/* The server cookie is already cleared. */}window.location.assign("/login");}catch{window.location.assign("/sesion");}}
  return <div className={`sc-app sc-app-${role.toLowerCase()}${hideMobileNav?" sc-app-focus":""}`}>
    <a className="sc-skip-link" href="#sc-main">Saltar al contenido</a>
    <header className="sc-top">
      <div className="sc-top-inner">
        <Link href={destination(links[0][0])} className="sc-brand"><span className="sc-brand-mark"><Route size={24} aria-hidden /></span><span>SemanControl<small>{roleLabel}</small></span></Link>
        {role!=="CLIENT"&&<nav className="sc-nav" aria-label="Navegación principal">{links.map(([href,label,Icon])=><Link key={href} href={destination(href)} aria-current={active(href)?"page":undefined}><Icon size={21} aria-hidden /><span>{label}</span></Link>)}</nav>}
        <div className="sc-top-context"><button type="button" className="sc-icon-button" onClick={logout} aria-label="Cerrar sesión"><LogOut size={20} aria-hidden /></button></div>
      </div>
    </header>
    <main id="sc-main" className="sc-page" tabIndex={-1}><div className="sc-heading"><p className="sc-eyebrow">{roleLabel}</p><h1 tabIndex={-1}>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{children}</main>
    <footer className="sc-bottom">SemanControl · Cuentas claras, tarjeta por tarjeta</footer>
  </div>;
}
