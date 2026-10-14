"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Wallet } from "lucide-react";
import { AppShell, Field, Money, Notice } from "@/components/ui";
import { api, ClientApiError, useSession } from "@/lib/client-api";
import type { RouteProduct } from "@/lib/contracts";
import { queuedDispatches, readLocal, routeQueue, saveLocal } from "@/lib/offline/storage";
import { PendingDetail, QueueStatus, errorText, useQueue, type RouteData } from "../route-shared";

interface SummaryData { dispatch: { id: string; name: string; dispatch_date: string; status: "OPEN" | "CLOSED" }; cash_total: number; transfer_total: number; transfer_count: number; inventory: RouteProduct[]; sync_confirmed: boolean }
export default function RouteSummary({ initialDispatch }: { initialDispatch: string }) {
  const { user, loading, error: sessionError } = useSession(), uid = user?.firebaseUid;
  const [dispatch, setDispatch] = useState(initialDispatch), [routes, setRoutes] = useState<{ owner: string; value: RouteData["dispatches"] }>({ owner: "", value: [] });
  const owner = `${uid ?? ""}:${dispatch}`;
  const [state, setState] = useState<{ owner: string; data: SummaryData | null; observed: string | null; error: string | null }>({ owner: "", data: null, observed: null, error: null });
  const [declaring, setDeclaring] = useState(false), [message, setMessage] = useState<string | null>(null);
  const data = state.owner === owner ? state.data : null;
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    if (!uid || !dispatch) return;
    const version = ++requestVersion.current;
    try {
      const next = await api<SummaryData>(`/api/ruta/resumen?dispatch_id=${encodeURIComponent(dispatch)}`);
      await saveLocal("snapshots", uid, `summary:${dispatch}`, next);
      if (version === requestVersion.current) setState({ owner, data: next, observed: null, error: null });
    } catch (error) {
      const denied = error instanceof ClientApiError && [401, 403].includes(error.status);
      const saved = denied ? null : await readLocal<SummaryData>("snapshots", uid, `summary:${dispatch}`).catch(() => null);
      if (version === requestVersion.current) setState({ owner, data: saved?.value ?? null, observed: saved?.observed_at ?? null, error: saved ? null : errorText(error) });
    }
  }, [uid, dispatch, owner]);
  const queue = useQueue(uid, dispatch, () => void load());
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    api<RouteData>("/api/ruta").then(async (next) => {
      const pendingDispatches = await queuedDispatches(uid);
      for (const pendingId of pendingDispatches) if (!next.dispatches.some((route) => route.id === pendingId)) next.dispatches.push({ id: pendingId, name: "Recorrido con pendientes conservados", dispatch_date: "", status: "CLOSED" });
      await saveLocal("snapshots", uid, "route:", next);
      if (!alive) return;
      setRoutes({ owner: uid, value: next.dispatches });
      if (!initialDispatch && next.dispatches.length === 1) setDispatch(next.dispatches[0].id);
    }).catch(async (error) => {
      if (error instanceof ClientApiError && [401, 403].includes(error.status)) return;
      const saved = await readLocal<RouteData>("snapshots", uid, "route:").catch(() => null);
      if (alive && saved) { setRoutes({ owner: uid, value: saved.value.dispatches }); if (!initialDispatch && saved.value.dispatches.length === 1) setDispatch(saved.value.dispatches[0].id); }
    });
    return () => { alive = false; };
  }, [uid, initialDispatch]);
  const unresolved = queue.rows.filter((row) => row.state !== "registered" && !row.resolved_by);
  async function declareSynchronized() {
    if (!uid || !dispatch || declaring) return;
    setDeclaring(true); setMessage(null);
    try {
      if (await routeQueue.hasUnresolved(uid, dispatch)) throw new Error("Sincroniza y resuelve todos los pendientes de este recorrido antes de declarar.");
      await api("/api/ruta/resumen", { method: "POST", body: JSON.stringify({ dispatch_id: dispatch }) });
      await load(); setMessage("Declaración registrada. El jefe puede revisar tu cuadre.");
    } catch (error) { setState((previous) => ({ ...previous, owner, error: errorText(error) })); }
    finally { setDeclaring(false); }
  }
  return <AppShell role="WORKER" title="Mi cuadre del día" subtitle="Tus cobros y los sobrantes compartidos para entregar cuentas.">
    <Link className="sc-button sc-button-secondary" style={{ marginBottom: 20 }} href={`/ruta?dispatch_id=${encodeURIComponent(dispatch)}`}><ArrowLeft size={18} />Volver a mi ruta</Link>
    {(sessionError || state.error) && <Notice tone="error">{sessionError || state.error}</Notice>}{loading && <Notice>Consultando tu cuenta…</Notice>}{message && <Notice tone="success">{message}</Notice>}
    <section className="sc-panel"><Field label="Recorrido"><select value={dispatch} onChange={(event) => { setDispatch(event.target.value); setMessage(null); }}><option value="">Selecciona un recorrido</option>{routes.owner === uid && routes.value.map((route) => <option key={route.id} value={route.id}>{route.name} · {route.dispatch_date} · {route.status === "CLOSED" ? "Cerrado" : "Abierto"}</option>)}{data && !routes.value.some((route) => route.id === data.dispatch.id) && <option value={data.dispatch.id}>{data.dispatch.name} · {data.dispatch.dispatch_date}</option>}</select></Field></section>
    <QueueStatus rows={queue.rows} busy={queue.busy} online={queue.online} onSync={() => void queue.synchronize().then(load)} />
    {queue.error && <Notice tone="error">{queue.error}</Notice>}
    {data && <>{state.observed && <Notice>Resumen consultado {new Date(state.observed).toLocaleString("es-CO", { timeZone: "America/Bogota" })}. Con conexión podrás actualizarlo.</Notice>}<div className="sc-grid"><div className="sc-stat"><small>Efectivo que tú debes entregar</small><strong><Money value={data.cash_total} /></strong><p className="sc-muted">Tus visitas confirmadas por el servidor</p></div><div className="sc-stat"><small>Tus transferencias registradas</small><strong><Money value={data.transfer_total} /></strong><p className="sc-muted">{data.transfer_count} comprobante{data.transfer_count === 1 ? "" : "s"} · sujetos a conciliación bancaria</p></div></div>
      <section className="sc-panel"><h2>Sobrante físico del recorrido</h2><p className="sc-muted" style={{ marginBottom: 18 }}>Esta carga es compartida. Coordina con tus compañeros la entrega al jefe.</p><div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Producto</th><th>Carga inicial</th><th>Por devolver</th></tr></thead><tbody>{data.inventory.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.initial_qty}</td><td style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{product.remaining_qty}</td></tr>)}</tbody></table></div>{!data.inventory.length && <p className="sc-muted">Sin productos cargados.</p>}</section>
      <section className="sc-panel"><h2>Entregar el cuadre</h2>{data.dispatch.status === "CLOSED" ? <Notice>El recorrido está cerrado. Cualquier pendiente tardío conserva su referencia para revisarlo con el administrador.</Notice> : <><Notice>{data.sync_confirmed && !unresolved.length ? "Tu declaración de sincronización está registrada." : "Declara únicamente cuando hayas sincronizado todas las visitas de tus dispositivos. Los pendientes de otros teléfonos no aparecen aquí."}</Notice><button type="button" className="sc-button" disabled={declaring || queue.busy || unresolved.length > 0 || !queue.online} onClick={() => void declareSynchronized()}><Check size={20} />{declaring ? "Registrando declaración…" : "Ya sincronicé todos mis pendientes"}</button></>}</section></>}
    {unresolved.length > 0 && <section><h2 className="sc-actions" style={{ fontWeight: 800, marginBottom: 14 }}><Wallet size={20} />Pendientes que faltan en el cuadre</h2>{unresolved.map((row) => <div key={row.key}><Link className="sc-button sc-button-secondary" href={`/ruta/cliente/${encodeURIComponent(row.payload.client_id)}?dispatch_id=${encodeURIComponent(dispatch)}`}>Revisar tarjeta</Link><PendingDetail row={row} /></div>)}</section>}
  </AppShell>;
}
