"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Route, Users, Warehouse } from "lucide-react";
import { AppShell, Badge, Field, Notice, SubmitButton } from "@/components/ui";
import { MutationNotice, ResourceNotice, RoleBoundary, useMutation, useResource } from "../_components";
import type { AdminProduct, Dispatch, Worker } from "../_types";

import ProductCatalog from "./product-catalog";

interface InventoryData { products: AdminProduct[]; workers: Worker[]; dispatches: Dispatch[] }
const emptyWorker = { id: "", name: "", email: "", is_active: true, reason: "" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function revealEditor(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
}

export default function InventoryPage() {
  return <RoleBoundary role="ADMIN"><InventoryScreen /></RoleBoundary>;
}

function InventoryScreen() {
  const resource = useResource<InventoryData>("/api/admin/inventario");
  const [tab, setTab] = useState<"products" | "routes" | "workers">("products");
  const [worker, setWorker] = useState(emptyWorker);
  const workerInput = useRef<HTMLInputElement>(null);
  const [workerFocusRequest, setWorkerFocusRequest] = useState(0);
  useEffect(() => { if (workerFocusRequest) revealEditor(workerInput.current); }, [workerFocusRequest]);
  const workerMutation = useMutation();
  const products = resource.data?.products ?? [];
  const workers = resource.data?.workers ?? [];
  async function saveWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await workerMutation.run("/api/admin/trabajadores", {
      ...(worker.id ? { id: worker.id } : {}), name: worker.name.trim(), email: worker.email.trim().toLowerCase(),
      is_active: worker.is_active ? 1 : 0, reason: worker.reason.trim(),
    }, "Trabajador guardado.");
    if (result) { setWorker(emptyWorker); resource.refresh(); }
  }
  return <AppShell role="ADMIN" title="Bodega y recorridos" subtitle="Productos en bodega, carga de rutas y entregas en cada tarjeta.">
    <div className="sc-section-header">
      <div className="sc-segmented" role="group" aria-label="Áreas de bodega">
        <button type="button" className="sc-button" aria-pressed={tab === "products"} onClick={() => setTab("products")}><Warehouse size={18} aria-hidden /> Bodega y costos</button>
        <button type="button" className="sc-button" aria-pressed={tab === "routes"} onClick={() => setTab("routes")}><Route size={18} aria-hidden /> Armar recorridos</button>
        <button type="button" className="sc-button" aria-pressed={tab === "workers"} onClick={() => setTab("workers")}><Users size={18} aria-hidden /> Trabajadores</button>
      </div>
      <button type="button" className="sc-icon-button" disabled={resource.loading} onClick={resource.refresh} aria-label="Actualizar inventario"><RefreshCw size={20} /></button>
    </div>
    <ResourceNotice {...resource} />
    {resource.data && <>
      <div className="sc-grid sc-stats-grid" aria-label="Existencias actuales">
        <div className="sc-stat"><small>Existencias totales</small><strong>{products.reduce((sum, item) => sum + item.total_stock, 0)} unidades</strong><small>Bodega y rutas</small></div>
        <div className="sc-stat"><small>Asignado a rutas</small><strong>{products.reduce((sum, item) => sum + item.reserved_stock, 0)} unidades</strong><small>Carga restante en recorridos abiertos</small></div>
        <div className="sc-stat"><small>En bodega</small><strong>{products.reduce((sum, item) => sum + item.available_stock, 0)} unidades</strong><small>Libre para el próximo despacho</small></div>
      </div>
      <div hidden={tab !== "products"}><ProductCatalog products={products} loading={resource.loading} refresh={resource.refresh} /><UnusedPhotos loading={resource.loading} /></div>
      {tab === "routes" && <><DispatchForm products={products} workers={workers} loading={resource.loading} refresh={resource.refresh} /><section className="sc-panel"><h2>Recorridos registrados</h2>{resource.data.dispatches.length ? <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Recorrido</th><th scope="col">Trabajadores</th><th scope="col">Carga compartida restante</th><th scope="col">Estado</th></tr></thead><tbody>{resource.data.dispatches.map((dispatch) => <tr key={dispatch.id}><td data-label="Recorrido"><div><strong>{dispatch.name}</strong><br />{dispatch.dispatch_date}</div></td><td data-label="Trabajadores">{dispatch.workers.map((person) => person.name).join(", ")}</td><td data-label="Carga compartida restante">{dispatch.inventory.map((item) => `${item.name}: ${item.remaining_qty} de ${item.initial_qty}`).join(" · ") || "Sin carga"}</td><td data-label="Estado"><Badge tone={dispatch.status === "OPEN" ? "info" : "neutral"}>{dispatch.status === "OPEN" ? "Abierto" : "Cerrado"}</Badge></td></tr>)}</tbody></table></div> : <Notice>Todavía no hay recorridos.</Notice>}</section></>}
      {tab === "workers" && <div className="sc-grid"><section className="sc-panel"><h2>Equipo de ruta</h2><p className="sc-muted" style={{ marginBottom: 16 }}>Autoriza el correo Google del trabajador antes de asignarlo a un recorrido.</p>{workers.map((person) => <div key={person.id} style={{ paddingBlock: 14, borderBottom: "1px solid #dce4e8" }}><strong>{person.name}</strong><p style={{ overflowWrap: "anywhere" }}>{person.email}</p><div className="sc-actions"><Badge tone={person.is_active ? "success" : "neutral"}>{person.is_active ? "Activo" : "Desactivado"}</Badge><button type="button" className="sc-button sc-button-secondary" disabled={workerMutation.busy || resource.loading} onClick={() => { setWorker({ id: person.id, name: person.name, email: person.email, is_active: Boolean(person.is_active), reason: "" }); workerMutation.clear(); setWorkerFocusRequest((request) => request + 1); }}><Pencil size={16} aria-hidden /> Editar acceso</button></div></div>)}{!workers.length && <Notice>Agrega un trabajador para preparar recorridos.</Notice>}</section><section className="sc-panel"><h2>{worker.id ? "Editar trabajador" : "Agregar trabajador"}</h2><MutationNotice {...workerMutation} /><form onSubmit={saveWorker}><fieldset disabled={workerMutation.busy || resource.loading}>
        <Field label="Nombre"><input ref={workerInput} required maxLength={140} value={worker.name} onChange={(event) => setWorker({ ...worker, name: event.target.value })} /></Field><Field label="Correo Google"><input type="email" required maxLength={254} value={worker.email} onChange={(event) => setWorker({ ...worker, email: event.target.value })} /></Field><label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" checked={worker.is_active} onChange={(event) => setWorker({ ...worker, is_active: event.target.checked })} /> Acceso activo</label>{!worker.is_active && <Notice>El acceso se revocará al guardar. Conserva sus cobros e historial. Si tiene un recorrido abierto, primero debe declarar sus pendientes sincronizados desde Mi cuadre; después actualiza y desactiva el acceso.</Notice>}<Field label="Motivo"><textarea required maxLength={500} value={worker.reason} onChange={(event) => setWorker({ ...worker, reason: event.target.value })} /></Field><div className="sc-actions"><SubmitButton disabled={workerMutation.busy}>{workerMutation.busy ? "Guardando…" : "Guardar trabajador"}</SubmitButton>{worker.id && <button type="button" className="sc-button sc-button-secondary" onClick={() => { setWorker(emptyWorker); workerMutation.clear(); }}>Cancelar edición</button>}</div>
      </fieldset></form></section></div>}
    </>}
  </AppShell>;
}

function UnusedPhotos({ loading }: { loading: boolean }) {
  const mutation = useMutation(); const [deleted, setDeleted] = useState<number | null>(null);
  async function clean(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDeleted(null);
    const result = await mutation.run<{ deleted: number }>("/api/admin/comprobantes/limpiar", {}, "Limpieza de fotos completada.");
    if (result) setDeleted(result.deleted);
  }
  return <section className="sc-panel"><h2>Fotos de transferencias sin usar</h2><p className="sc-muted" style={{ marginBottom: 16 }}>Elimina fotos sin asociar a una visita que tengan más de 48 horas. Los comprobantes de pagos registrados se conservan.</p><MutationNotice {...mutation} />{deleted !== null && <Notice tone="success">{deleted === 0 ? "No había fotos sin usar con más de 48 horas." : `${deleted} ${deleted === 1 ? "foto sin usar eliminada" : "fotos sin usar eliminadas"}.`}</Notice>}<form onSubmit={clean}><SubmitButton disabled={mutation.busy || loading}>{mutation.busy ? "Limpiando fotos…" : "Eliminar fotos sin usar"}</SubmitButton></form></section>;
}

function DispatchForm({ products, workers, loading, refresh }: { products: AdminProduct[]; workers: Worker[]; loading: boolean; refresh: () => void }) {
  const [name, setName] = useState(""); const [date, setDate] = useState(today);
  const [workerIds, setWorkerIds] = useState<string[]>([]); const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState(""); const mutation = useMutation();
  const activeProducts = products.filter((item) => item.is_active); const activeWorkers = workers.filter((item) => item.is_active);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation("");
    const items = activeProducts.map((item) => ({ product_id: item.id, qty: Number(quantities[item.id] ?? 0) })).filter((item) => item.qty > 0);
    if (!workerIds.length || !items.length) { setValidation("Selecciona al menos un trabajador y un producto con unidades."); return; }
    const result = await mutation.run("/api/admin/recorridos", { name: name.trim(), dispatch_date: date, worker_ids: workerIds, items }, "Recorrido creado y carga reservada.");
    if (result) { setName(""); setWorkerIds([]); setQuantities({}); refresh(); }
  }
  return <section className="sc-panel"><h2>Preparar un recorrido</h2><p className="sc-muted" style={{ marginBottom: 16 }}>La carga se comparte entre los trabajadores seleccionados. Reservarla no cambia el total del negocio. Queda congelada después de la primera visita.</p><MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}<form onSubmit={submit}><fieldset disabled={mutation.busy || loading}>
    <div className="sc-grid"><Field label="Nombre del recorrido"><input required maxLength={140} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Fecha de salida"><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></Field></div>
    <fieldset style={{ marginBottom: 18 }}><legend style={{ fontWeight: 700 }}>Trabajadores asignados</legend><div className="sc-actions">{activeWorkers.map((person) => <label key={person.id} className="sc-actions" style={{ minHeight: 48, border: "1px solid #dce4e8", padding: "8px 14px", borderRadius: 8 }}><input type="checkbox" checked={workerIds.includes(person.id)} onChange={(event) => setWorkerIds((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />{person.name}</label>)}</div>{!activeWorkers.length && <Notice>Activa o agrega un trabajador en la pestaña Trabajadores.</Notice>}</fieldset>
    <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Producto</th><th scope="col">Total</th><th scope="col">Asignado a rutas</th><th scope="col">En bodega</th><th scope="col">Unidades a llevar</th></tr></thead><tbody>{activeProducts.map((item) => <tr key={item.id}><td data-label="Producto"><strong>{item.name}</strong></td><td data-label="Total">{item.total_stock}</td><td data-label="Asignado a rutas">{item.reserved_stock}</td><td data-label="En bodega">{item.available_stock}</td><td data-label="Unidades a llevar"><input aria-label={`Unidades de ${item.name} para el recorrido`} type="number" min="0" max={item.available_stock} step="1" inputMode="numeric" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })} style={{ minWidth: 110, maxWidth: 160 }} /></td></tr>)}</tbody></table></div>
    <SubmitButton disabled={mutation.busy || !activeWorkers.length || !activeProducts.length} style={{ marginTop: 20 }}><Route size={18} aria-hidden />{mutation.busy ? "Creando…" : "Crear y despachar recorrido"}</SubmitButton>
  </fieldset></form></section>;
}
