"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured, signInWithGoogle } from "@/lib/auth/client";

function signInError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "No se completó el acceso. Puedes intentarlo de nuevo.";
  if (code === "auth/popup-blocked") return "Permite la ventana de Google en tu navegador y vuelve a intentarlo.";
  if (code === "auth/network-request-failed") return "No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.";
  return "No pudimos iniciar sesión. Intenta de nuevo o contacta al administrador.";
}

export function GoogleSignInButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  async function handleSignIn() {
    setBusy(true);
    setMessage(null);
    try {
      const credential = await signInWithGoogle();
      const token = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
      });
      if (!response.ok) {
        await signOut(getFirebaseAuth());
        setMessage(response.status === 403 ? "Esta cuenta no tiene acceso. Contacta al administrador para vincularla." : response.status === 429 ? "Has intentado acceder varias veces. Espera un minuto e inténtalo de nuevo." : "No pudimos confirmar el acceso. Intenta de nuevo.");
        return;
      }
      const session = await response.json() as { redirectTo: string };
      window.location.assign(["/admin/cierre", "/ruta", "/mi-cuenta"].includes(session.redirectTo) ? session.redirectTo : "/sesion");
    } catch (error) {
      setMessage(signInError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignIn} disabled={busy || !configured} aria-busy={busy} aria-describedby={!configured ? "google-access-pending" : undefined} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#155f4b] px-5 py-3 font-bold text-white hover:bg-[#104b3b] disabled:cursor-default disabled:opacity-70">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c2-1.8 2.9-4.4 2.9-7.4ZM12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.6A10 10 0 0 0 12 22ZM6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.4-2.6ZM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.6A6 6 0 0 1 12 5.9Z" /></svg>
        {!configured ? "Acceso con Google pendiente" : busy ? "Ingresando…" : "Continuar con Google"}
      </button>
      {!configured && <p id="google-access-pending" className="mt-4 text-sm leading-relaxed text-[#405766]">El administrador está preparando el acceso. Vuelve a intentarlo más tarde.</p>}
      {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-relaxed text-red-900">{message}</p>}
    </div>
  );
}
