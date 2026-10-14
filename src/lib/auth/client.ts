"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth, type UserCredential } from "firebase/auth";

function getFirebaseOptions() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function isFirebaseConfigured(): boolean {
  return Object.values(getFirebaseOptions()).every(Boolean);
}

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") throw new Error("El inicio de sesión está disponible en el navegador.");
  if (!isFirebaseConfigured()) throw new Error("Configura las variables públicas de Firebase para iniciar sesión.");
  const existing = getApps().find((app) => app.name === "semancontrol");
  return getAuth(existing ?? initializeApp(getFirebaseOptions(), "semancontrol"));
}
export function signInWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(getFirebaseAuth(), provider);
}
