"use client";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { Notice, Money } from "@/components/ui";
import type { ClientCard, Movement, RouteProduct } from "@/lib/contracts";
import type { QueueRecord } from "@/lib/offline/queue";
import { routeQueue } from "@/lib/offline/storage";
import { syncRoute } from "@/lib/offline/sync";

export interface RouteData { dispatches: { id: string; name: string; dispatch_date: string; status: "OPEN" | "CLOSED" }[]; clients: ClientCard[]; inventory: RouteProduct[] }
export interface ClientData { client: ClientCard; inventory: RouteProduct[]; history: Movement[]; dispatch_status?: "OPEN" | "CLOSED" }
export function errorText(error: unknown) { return error instanceof Error ? error.message : "No pudimos completar esta acción."; }
export function useConnection() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}
export function useQueue(uid: string | undefined, dispatch: string, onSynchronized?: () => void) {
  const [state, setState] = useState<{ owner: string; rows: QueueRecord[]; busy: boolean; error: string | null }>({ owner: "", rows: [], busy: false, error: null });
  const online = useConnection();
  const owner = `${uid ?? ""}:${dispatch}`;
  async function refresh() {
    if (!uid || !dispatch) return;
    const rows = await routeQueue.list(uid, dispatch);
    setState((previous) => ({ ...previous, owner, rows }));
  }
  async function synchronize() {
    if (!uid || !dispatch) return;
    setState((previous) => ({ ...previous, owner, busy: true, error: null }));
    try {
      const before = await routeQueue.list(uid, dispatch);
      await syncRoute(uid, dispatch); await refresh();
      const after = await routeQueue.list(uid, dispatch);
      if (after.some((row) => row.state === "registered" && !before.some((old) => old.key === row.key && old.state === "registered"))) onSynchronized?.();
    }
    catch (error) { setState((previous) => ({ ...previous, owner, error: errorText(error) })); }
    finally { setState((previous) => ({ ...previous, busy: false })); }
  }
  useEffect(() => {
    if (!uid || !dispatch) return;
    let alive = true;
    routeQueue.list(uid, dispatch).then((rows) => { if (alive) setState({ owner, rows, busy: false, error: null }); }).catch((error) => { if (alive) setState({ owner, rows: [], busy: false, error: errorText(error) }); });
    const update = () => { if (alive) void refresh().catch(() => undefined); };
    window.addEventListener("semancontrol-queue", update);
    return () => { alive = false; window.removeEventListener("semancontrol-queue", update); };
    // Scope changes replace all rendered local data immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dispatch]);
  useEffect(() => {
    if (online && uid && dispatch) void synchronize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, uid, dispatch]);
  return { rows: state.owner === owner ? state.rows : [], busy: state.busy, error: state.owner === owner ? state.error : null, refresh, synchronize, online };
}
export function QueueStatus({ rows, busy, online, onSync }: { rows: QueueRecord[]; busy: boolean; online: boolean; onSync: () => void }) {
  const active = rows.filter((row) => row.state !== "registered" && !row.resolved_by);
  if (!active.length && online) return null;
  return <Notice><div className="sc-actions">{!online && <CloudOff size={20} />}<span>{active.length ? `${active.length} visita${active.length === 1 ? "" : "s"} pendiente${active.length === 1 ? "" : "s"} de sincronizar` : "Sin conexión"}. Los saldos y la carga mostrados son la última consulta; no aseguran disponibilidad.</span><button type="button" className="sc-button sc-button-secondary" disabled={busy || !online} onClick={onSync}><RefreshCw size={18} />{busy ? "Sincronizando…" : "Sincronizar"}</button></div></Notice>;
}
export function PendingDetail({ row }: { row: QueueRecord }) {
  return <div className="sc-panel"><span className="sc-badge">{row.state === "registered" ? "Registrada" : row.reported_incident ? "Enviada al administrador; pendiente de revisión" : row.state === "conflict" ? "Requiere revisión" : "Pendiente de sincronizar"}</span><p className="sc-muted">{new Date(row.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p><p>Abono físico: <Money value={row.payload.payment_amount} /> · {row.payload.payment_method === "TRANSFER" ? "Transferencia pendiente de banco" : row.payload.payment_method === "CASH" ? "Efectivo" : "Sin abono"}</p>{row.payload.items.length > 0 && <p>Productos entregados: {row.payload.items.map((item) => `${item.qty} unidades`).join(", ")}</p>}{row.error && <p role="alert">{row.error}</p>}{row.resolved_by && <p className="sc-muted">Conservamos esta incidencia junto a su nueva confirmación.</p>}{row.reported_incident && <p className="sc-muted">Referencia de incidencia: {row.reported_incident}</p>}<small className="sc-muted">Referencia de operación: {row.payload.idempotency_key}</small></div>;
}
