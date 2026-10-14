"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, Plus, Search, X } from "lucide-react";
import { AppShell, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { api, ClientApiError, useSession } from "@/lib/client-api";
import type { ClientCard } from "@/lib/contracts";
import { queuedDispatches, readLocal, saveLocal } from "@/lib/offline/storage";
import { PendingDetail, QueueStatus, errorText, useQueue, type ClientData, type RouteData } from "./route-shared";
import VisitView from "./cliente/[id]/visit-view";

export default function RouteBoard({ initialDispatch }: { initialDispatch: string }) {
  const { user, loading, error: sessionError } = useSession();
  const uid = user?.firebaseUid;
  const [dispatch, setDispatch] = useState(initialDispatch);
  const [knownRoutes, setKnownRoutes] = useState<{ uid: string; dispatches: RouteData["dispatches"] }>({ uid: "", dispatches: [] });
  const [state, setState] = useState<{ owner: string; data: RouteData | null; observed: string | null; error: string | null; loading: boolean }>({ owner: "", data: null, observed: null, error: null, loading: true });
  const [filter, setFilter] = useState("pending"), [search, setSearch] = useState("");
  const [create, setCreate] = useState(false), [saving, setSaving] = useState(false), [createError, setCreateError] = useState<string | null>(null);
  const [attending, setAttending] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const owner = `${uid ?? ""}:${dispatch}`;
  const load = useCallback(async () => {
    if (!uid) return;
    const version = ++requestVersion.current;
    setState((previous) => ({ owner, data: previous.owner === owner ? previous.data : null, observed: previous.owner === owner ? previous.observed : null, loading: true, error: null }));
    try {
      const data = await api<RouteData>(`/api/ruta${dispatch ? `?dispatch_id=${encodeURIComponent(dispatch)}` : ""}`);
      const pendingDispatches = await queuedDispatches(uid);
      for (const pendingId of pendingDispatches) if (!data.dispatches.some((route) => route.id === pendingId)) data.dispatches.push({ id: pendingId, name: "Recorrido con pendientes conservados", dispatch_date: "", status: "CLOSED" });
      await saveLocal("snapshots", uid, `route:${dispatch}`, data);
      if (dispatch) await Promise.all(data.clients.map(async (client) => {
        const existing = await readLocal<ClientData>("snapshots", uid, `client:${dispatch}:${client.id}`);
        await saveLocal<ClientData>("snapshots", uid, `client:${dispatch}:${client.id}`, { client, inventory: data.inventory, history: existing?.value.history ?? [], dispatch_status: data.dispatches.find((route) => route.id === dispatch)?.status });
      }));
      if (version !== requestVersion.current) return;
      setKnownRoutes({ uid, dispatches: data.dispatches });
      setState({ owner, data, observed: null, error: null, loading: false });
      if (!dispatch && data.dispatches.length === 1) setDispatch(data.dispatches[0].id);
    } catch (error) {
      const denied = error instanceof ClientApiError && [401, 403].includes(error.status);
      if (denied && version === requestVersion.current) setKnownRoutes({ uid: "", dispatches: [] });
      const saved = denied ? null : await readLocal<RouteData>("snapshots", uid, `route:${dispatch}`).catch(() => null);
      if (version === requestVersion.current) setState({ owner, data: saved?.value ?? null, observed: saved?.observed_at ?? null, error: saved ? null : errorText(error), loading: false });
    }
  }, [uid, dispatch, owner]);
  const queue = useQueue(uid, dispatch, () => void load());
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { if (create) dialog.current?.showModal(); else dialog.current?.close(); }, [create]);
  const data = state.owner === owner ? state.data : null;
  const dispatchOptions = data?.dispatches ?? (knownRoutes.uid === uid ? knownRoutes.dispatches : []);
  if (attending && user && dispatch) return <VisitView id={attending} dispatch={dispatch} session={user} onBack={() => { setAttending(null); void load(); }} />;
  const clients = data?.clients.filter((client) => {
    const visited = (client.visits_count ?? 0) > 0 || !!client.visited_by;
    return (filter === "all" || (filter === "visited" ? visited : !visited)) && `${client.name} ${client.address} ${client.address_reference} #${client.route_order}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es").trim());
  }).sort((a, b) => a.route_order - b.route_order) ?? [];
  const activeDispatch = dispatchOptions.find((route) => route.id === dispatch);
  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!uid || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setCreateError(null);
    try {
      await api<{ client: ClientCard }>("/api/ruta/clientes", { method: "POST", body: JSON.stringify({ name: form.get("name"), address: form.get("address"), address_reference: form.get("address_reference"), linked_email: String(form.get("linked_email") ?? "").trim() || null }) });
      setCreate(false); await load();
    } catch (error) { setCreateError(errorText(error)); } finally { setSaving(false); }
  }
  return <AppShell role="WORKER" title="Mi hoja de ruta" subtitle="Tarjeta por tarjeta, en el orden de tu recorrido.">
    {(sessionError || state.error) && <Notice tone="error">{sessionError || state.error}</Notice>}
    {(loading || state.loading) && !data && <Notice>Consultando tu ruta…</Notice>}
    <section className="sc-panel"><div className="sc-actions" style={{ justifyContent: "space-between" }}><h2>Mi carga hoy</h2>{dispatch && <Link className="sc-button sc-button-secondary" href={`/ruta/resumen?dispatch_id=${encodeURIComponent(dispatch)}`}>Mi cuadre <ArrowRight size={18} /></Link>}</div>
      <Field label="Recorrido asignado"><select value={dispatch} onChange={(event) => { setDispatch(event.target.value); setAttending(null); }}><option value="">{dispatchOptions.length ? "Selecciona un recorrido" : "Sin recorridos asignados"}</option>{dispatchOptions.map((route) => <option value={route.id} key={route.id}>{route.name} · {route.dispatch_date} · {route.status === "CLOSED" ? "Cerrado" : "Abierto"}</option>)}</select></Field>
      {state.observed && <Notice>Última consulta: {new Date(state.observed).toLocaleString("es-CO", { timeZone: "America/Bogota" })}. Conservamos tu ruta en este teléfono.</Notice>}
      <div className="sc-actions">{dispatch && data?.inventory.map((product) => <span className="sc-badge" key={product.id}>{product.name}: {product.remaining_qty} restantes</span>)}</div>
      {activeDispatch?.status === "CLOSED" && <Notice>Este recorrido está cerrado. Los pendientes permanecen disponibles para revisión.</Notice>}
    </section>
    <QueueStatus rows={queue.rows} busy={queue.busy} online={queue.online} onSync={() => void queue.synchronize()} />
    {queue.error && <Notice tone="error">{queue.error}</Notice>}
    <section className="sc-panel"><div className="sc-actions" style={{ justifyContent: "space-between", marginBottom: 16 }}><div className="sc-actions" role="group" aria-label="Filtrar tarjetas">{[["pending", "Pendientes hoy"], ["visited", "Visitados hoy"], ["all", "Todos"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={`sc-button ${filter === value ? "" : "sc-button-secondary"}`} onClick={() => setFilter(value)}>{label}</button>)}</div><button className="sc-button" onClick={() => setCreate(true)} disabled={!uid || !queue.online}><Plus size={18} />Cliente</button></div>
      <Field label="Buscar tarjeta"><span style={{ position: "relative", display: "block" }}><Search size={20} style={{ position: "absolute", top: 14, left: 12 }} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, dirección o #orden" style={{ paddingLeft: 40 }} /></span></Field>
      {!dispatch && <Notice>Selecciona el recorrido antes de atender una tarjeta.</Notice>}
      {!clients.length && data && <p className="sc-muted">No hay tarjetas en este filtro.</p>}
      <div style={{ display: "grid", gap: 12 }}>{clients.map((client) => <Link prefetch={false} key={client.id} className="sc-panel" style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 14, marginBottom: 0, textDecoration: "none", color: "inherit" }} href={`/ruta/cliente/${encodeURIComponent(client.id)}?dispatch_id=${encodeURIComponent(dispatch)}`} onClick={(event) => { event.preventDefault(); if (dispatch) setAttending(client.id); }}>
        <strong style={{ fontSize: 26, color: "#155f4b", fontVariantNumeric: "tabular-nums" }}>#{client.route_order}</strong><div><div className="sc-actions" style={{ justifyContent: "space-between" }}><strong>{client.name}</strong><Money value={client.current_balance} /></div><p className="sc-muted" style={{ marginTop: 6 }}><MapPin size={14} style={{ display: "inline" }} /> {client.address}</p><p className="sc-muted">{client.address_reference}</p>{client.current_balance < 0 && <span className="sc-badge">Saldo a favor</span>}{client.visited_by && <p className="sc-muted">Atendido por {client.visited_by}{(client.visits_count ?? 0) > 1 ? ` · ${client.visits_count} visitas` : ""}</p>}{queue.rows.some((row) => row.payload.client_id === client.id && row.state !== "registered" && !row.resolved_by) && <span className="sc-badge">Visita pendiente local</span>}</div>
      </Link>)}</div>
    </section>
    {queue.rows.some((row) => row.state !== "registered" && !row.resolved_by) && <section><h2 style={{ fontWeight: 800, marginBottom: 14 }}>Pendientes conservados en este teléfono</h2>{queue.rows.filter((row) => row.state !== "registered" && !row.resolved_by).map((row) => <div key={row.key}><button className="sc-button sc-button-secondary" onClick={() => setAttending(row.payload.client_id)}>Revisar {data?.clients.find((client) => client.id === row.payload.client_id)?.name ?? "tarjeta"}</button><PendingDetail row={row} /></div>)}</section>}
    <dialog ref={dialog} onCancel={() => setCreate(false)} style={{ width: "min(92vw,480px)", border: "1px solid #a9bbc6", borderRadius: 14, padding: 24 }} aria-labelledby="new-client-title"><div className="sc-actions" style={{ justifyContent: "space-between" }}><h2 id="new-client-title" style={{ fontWeight: 800 }}>Nueva tarjeta</h2><button type="button" className="sc-icon-button" onClick={() => setCreate(false)} aria-label="Cerrar formulario"><X size={20} /></button></div><p className="sc-muted" style={{ marginBlock: 14 }}>Recibe automáticamente el siguiente número de tarjeta.</p>{createError && <Notice tone="error">{createError}</Notice>}<form onSubmit={createClient}><Field label="Nombre"><input name="name" required maxLength={120} autoComplete="name" /></Field><Field label="Dirección"><input name="address" required maxLength={240} autoComplete="street-address" /></Field><Field label="Referencia de la casa"><input name="address_reference" required maxLength={240} placeholder="Reja negra, segundo piso" /></Field><Field label="Correo Gmail (opcional)"><input name="linked_email" type="email" maxLength={254} autoComplete="email" /></Field><SubmitButton disabled={saving}>{saving ? "Guardando…" : "Crear cliente"}</SubmitButton></form></dialog>
  </AppShell>;
}

