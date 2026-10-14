/** Test-only identity seam. Every API request still reaches the real business services. */
import type { Principal } from "../../src/lib/auth/types";

declare global { interface Window { __browserFixturePrincipal: Principal } }
export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (typeof options.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) {
    const data = await response.json() as { error?: { code?: string; message?: string } };
    throw new ClientApiError(response.status, data.error?.code ?? "REQUEST_FAILED", data.error?.message ?? "Solicitud fallida");
  }
  return response;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> { return (await request(path, options)).json(); }
export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> { return (await request(path, options)).blob(); }
export function useSession() { return { user: window.__browserFixturePrincipal, loading: false, error: null }; }
export function getFirebaseAuth() { return { currentUser: { uid: window.__browserFixturePrincipal.firebaseUid } }; }
export async function signOut() { /* The fixture does not contact Firebase. */ }
