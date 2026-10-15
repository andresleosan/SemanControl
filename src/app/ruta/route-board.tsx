"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, Plus, Search, X } from "lucide-react";
import { AppShell, Badge, Field, Money, Notice, SubmitButton } from "@/components/ui";
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
  const returnPosition = useRef({ id: "", scroll: 0 });
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
  function openCard(clientId: string) {
    if (!dispatch) return;
    returnPosition.current = { id: clientId, scroll: window.scrollY };
    setAttending(clientId);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      const heading = document.querySelector<HTMLElement>("main h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    });
  }
  function returnToRoute() {
    setAttending(null); void load();
    requestAnimationFrame(() => {
      window.scrollTo({ top: returnPosition.current.scroll, behavior: "instant" });
      const target = document.getElementById(`route-card-${returnPosition.current.id}`) ?? document.querySelector<HTMLElement>("main h1");
      target?.focus({ preventScroll: true });
    });
  }
  if (attending && user && dispatch) return <VisitView id={attending} dispatch={dispatch} session={user} onBack={returnToRoute} />;
  const clients = data?.clients.filter((client) => {
    const visited = (client.visits_count ?? 0) > 0 || !!client.visited_by;
    return (filter === "all" || (filter === "visited" ? visited : !visited)) && `${client.name} ${client.address} ${client.address_reference} #${client.route_order}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es").trim());
  }).sort((a, b) => a.route_order - b.route_order) ?? [];
  const activeDispatch = dispatchOptions.find((route) => route.id === dispatch);
  const total = data?.clients.length ?? 0;
  const visitedCount = data?.clients.filter((client) => (client.visits_count ?? 0) > 0 || !!client.visited_by).length ?? 0;
  const filters = [{ value: "pending", label: "Pendientes hoy", count: total - visitedCount }, { value: "visited", label: "Visitados hoy", count: visitedCount }, { value: "all", label: "Todos", count: total }];
  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!uid || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setCreateError(null);
    try {
      await api<{ client: ClientCard }>("/api/ruta/clientes", { method: "POST", body: JSON.stringify({ name: form.get("name"), address: form.get("address"), address_reference: form.get("address_reference"), linked_email: String(form.get("linked_email") ?? "").trim() || null }) });
      setCreate(false); await load();
    } catch (error) { setCreateError(errorText(error)); } finally { setSaving(false); }
  }
  return <AppShell role="WORKER" dispatchId={dispatch} title="Mi hoja de ruta" subtitle="Tarjeta por tarjeta, en el orden de tu recorrido.">
    {(sessionError || state.error) && <Notice tone="error">{sessionError || state.error}</Notice>}
    {(loading || state.loading) && !data && <Notice>Consultando tu ruta…</Notice>}
    <section className="sc-panel sc-route-overview">
      <Field label="Recorrido asignado"><select value={dispatch} onChange={(event) => { setDispatch(event.target.value); setAttending(null); }}><option value="">{dispatchOptions.length ? "Selecciona un recorrido" : "Sin recorridos asignados"}</option>{dispatchOptions.map((route) => <option value={route.id} key={route.id}>{route.name} · {route.dispatch_date} · {route.status === "CLOSED" ? "Cerrado" : "Abierto"}</option>)}</select></Field>
      {dispatch && data && <div className="sc-route-progress"><div className="sc-actions" style={{ justifyContent: "space-between" }}><div><strong>{visitedCount} de {total} tarjetas atendidas</strong><p className="sc-muted">Visitas confirmadas de este recorrido</p></div><Badge tone={activeDispatch?.status === "CLOSED" ? "neutral" : "info"}>{activeDispatch?.status === "CLOSED" ? "Cerrado" : "En recorrido"}</Badge></div><progress value={visitedCount} max={total || 1} aria-label="Avance de tarjetas con visitas confirmadas" /></div>}
      {state.observed && <Notice tone="warning">Última consulta: {new Date(state.observed).toLocaleString("es-CO", { timeZone: "America/Bogota" })}. Conservamos tu ruta en este teléfono.</Notice>}
      {dispatch && <details className="sc-route-load" open><summary>Mi carga hoy <span className="sc-muted">· {data?.inventory.length ?? 0} productos</span></summary><div className="sc-actions sc-stock-pills">{data?.inventory.map((product) => <Badge tone={product.remaining_qty > 0 ? "neutral" : "warning"} key={product.id}>{product.name}: {product.remaining_qty} restantes</Badge>)}</div>{data && !data.inventory.length && <p className="sc-muted">Sin productos cargados en este recorrido.</p>}</details>}
      {activeDispatch?.status === "CLOSED" && <Notice tone="warning">Este recorrido está cerrado. Los pendientes permanecen disponibles para revisión.</Notice>}
    </section>
    <QueueStatus rows={queue.rows} busy={queue.busy} online={queue.online} onSync={() => void queue.synchronize()} />
    {queue.error && <Notice tone="error">{queue.error}</Notice>}
    <section className="sc-route-controls" aria-label="Tarjetas del recorrido"><div className="sc-segmented" role="group" aria-label="Filtrar tarjetas">{filters.map(({ value, label, count }) => <button type="button" className="sc-button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span className="sc-segmented-count" aria-hidden="true">{count}</span></button>)}</div>
      <Field label="Buscar tarjeta"><span style={{ position: "relative", display: "block" }}><Search size={20} aria-hidden="true" style={{ position: "absolute", top: 14, left: 12 }} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, dirección o #orden" style={{ paddingLeft: 40 }} /></span></Field>
      {!dispatch && <Notice>Selecciona el recorrido antes de atender una tarjeta.</Notice>}
      {!clients.length && data && <p className="sc-muted">No hay tarjetas en este filtro.</p>}
      <div className="sc-route-list">{clients.map((client) => <Link prefetch={false} id={`route-card-${client.id}`} key={client.id} className="sc-route-card" href={`/ruta/cliente/${encodeURIComponent(client.id)}?dispatch_id=${encodeURIComponent(dispatch)}`} onClick={(event) => { event.preventDefault(); openCard(client.id); }}>
        <strong className="sc-route-card__number">#{client.route_order}</strong><div className="sc-route-card__body"><div className="sc-route-card__top"><strong>{client.name}</strong><span className="sc-route-card__balance"><small>{client.current_balance < 0 ? "Saldo a favor" : "Saldo"}</small><Money value={Math.abs(client.current_balance)} /></span></div><p className="sc-route-card__address"><MapPin size={15} aria-hidden="true" />{client.address}</p><p className="sc-muted">{client.address_reference}</p><div className="sc-route-card__meta">{client.visited_by && <Badge tone="success">Atendido por {client.visited_by}{(client.visits_count ?? 0) > 1 ? ` · ${client.visits_count} visitas` : ""}</Badge>}{queue.rows.some((row) => row.payload.client_id === client.id && row.state !== "registered" && !row.resolved_by) && <Badge tone="warning">Visita pendiente local</Badge>}</div></div><ArrowRight size={18} aria-hidden="true" />
      </Link>)}</div>
    </section>
    {queue.rows.some((row) => row.state !== "registered" && !row.resolved_by) && <section><h2 style={{ fontWeight: 800, marginBottom: 14 }}>Pendientes conservados en este teléfono</h2>{queue.rows.filter((row) => row.state !== "registered" && !row.resolved_by).map((row) => <div key={row.key}><button className="sc-button sc-button-secondary" onClick={() => openCard(row.payload.client_id)}>Revisar {data?.clients.find((client) => client.id === row.payload.client_id)?.name ?? "tarjeta"}</button><PendingDetail row={row} /></div>)}</section>}
    <button type="button" className="sc-button sc-client-fab" onClick={() => setCreate(true)} disabled={!uid || !queue.online} title={queue.online ? "Crear una tarjeta" : "Conéctate para crear una tarjeta"}><Plus size={20} aria-hidden="true" />Cliente</button>
    <dialog ref={dialog} onCancel={() => setCreate(false)} style={{ width: "min(92vw,480px)", border: "1px solid #a9bbc6", borderRadius: 14, padding: 24 }} aria-labelledby="new-client-title"><div className="sc-actions" style={{ justifyContent: "space-between" }}><h2 id="new-client-title" style={{ fontWeight: 800 }}>Nueva tarjeta</h2><button type="button" className="sc-icon-button" onClick={() => setCreate(false)} aria-label="Cerrar formulario"><X size={20} /></button></div><p className="sc-muted" style={{ marginBlock: 14 }}>Recibe automáticamente el siguiente número de tarjeta.</p>{createError && <Notice tone="error">{createError}</Notice>}<form onSubmit={createClient}><Field label="Nombre"><input name="name" required maxLength={120} autoComplete="name" /></Field><Field label="Dirección"><input name="address" required maxLength={240} autoComplete="street-address" /></Field><Field label="Referencia de la casa"><input name="address_reference" required maxLength={240} placeholder="Reja negra, segundo piso" /></Field><Field label="Correo Gmail (opcional)"><input name="linked_email" type="email" maxLength={254} autoComplete="email" /></Field><SubmitButton disabled={saving}>{saving ? "Guardando…" : "Crear cliente"}</SubmitButton></form></dialog>
  </AppShell>;
}

