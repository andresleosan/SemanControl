"use client";
import { getFirebaseAuth } from "@/lib/auth/client";
import { api, ClientApiError } from "@/lib/client-api";
import { routeQueue } from "./storage";
import type { IncidentAcknowledgement } from "./queue";

function assertOwner(uid: string) {
  if (getFirebaseAuth().currentUser?.uid !== uid) throw new ClientApiError(401, "ACCOUNT_CHANGED", "Vuelve a tu cuenta para sincronizar estos pendientes.");
}
export async function syncRoute(uid: string, dispatch: string) {
  if (!navigator.onLine) return;
  await routeQueue.replay(uid, dispatch, {
    async upload(row) {
      assertOwner(uid);
      const data = new FormData();
      data.set("file", row.photo!, "comprobante.webp");
      data.set("receipt_id", row.payload.receipt_id!);
      data.set("client_id", row.payload.client_id);
      data.set("dispatch_id", dispatch);
      const response = await api<{ receipt_id: string }>("/api/comprobantes", { method: "POST", body: data });
      assertOwner(uid);
      if (response.receipt_id !== row.payload.receipt_id) throw new ClientApiError(409, "RECEIPT_CHANGED", "El comprobante no coincide con la operación guardada.");
    },
    async visit(payload) {
      assertOwner(uid);
      const result = await api<{ movement: { id: string }; replayed: boolean }>("/api/ruta/visita", { method: "POST", body: JSON.stringify(payload) });
      assertOwner(uid);
      return result;
    },
  });
}
export async function reportRouteIncident(uid: string, dispatch: string, key: string) {
  assertOwner(uid);
  return routeQueue.report(uid, dispatch, key, async (row) => {
    assertOwner(uid);
    const form = new FormData();
    form.set("payload", JSON.stringify(row.payload));
    if (row.photo) form.set("photo", row.photo, "comprobante.webp");
    const response = await api<IncidentAcknowledgement>("/api/ruta/incidencias", { method: "POST", body: form });
    assertOwner(uid);
    return response;
  });
}
