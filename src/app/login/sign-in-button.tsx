"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured, signInWithGoogle } from "@/lib/auth/client";
import styles from "./sign-in-button.module.css";

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
      <button type="button" onClick={handleSignIn} disabled={busy || !configured} aria-busy={busy} aria-describedby={!configured ? "google-access-pending" : undefined} className={styles.button}>
        {busy ? <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> : <img src="/google-g.png" width={20} height={20} alt="" />}
        <span>{!configured ? "Acceso con Google pendiente" : busy ? "Ingresando…" : "Continuar con Google"}</span>
      </button>
      {!configured && <p id="google-access-pending" className={styles.pending}>El administrador está preparando el acceso. Vuelve a intentarlo más tarde.</p>}
      {message && <p role="alert" className={styles.error}><CircleAlert size={18} aria-hidden="true" /><span>{message}</span></p>}
    </div>
  );
}
