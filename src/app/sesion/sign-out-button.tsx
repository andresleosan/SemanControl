"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/auth/client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión");
      await signOut(getFirebaseAuth());
      window.location.assign("/login");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return <div><button type="button" onClick={handleSignOut} disabled={busy} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold hover:bg-slate-100 disabled:opacity-70">{busy ? "Cerrando sesión…" : "Cerrar sesión"}</button>{failed && <p role="alert" className="mt-3 text-sm text-red-900">No pudimos cerrar la sesión. Inténtalo de nuevo.</p>}</div>;
}
