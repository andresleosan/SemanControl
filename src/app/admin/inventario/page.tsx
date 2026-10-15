"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PackagePlus, Pencil, Plus, RefreshCw, Route, Users, Warehouse } from "lucide-react";
import { AppShell, Badge, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { MutationNotice, ResourceNotice, RoleBoundary, useMutation, useResource } from "../_components";
import type { AdminProduct, Dispatch, Worker } from "../_types";

interface InventoryData { products: AdminProduct[]; workers: Worker[]; dispatches: Dispatch[] }
const emptyProduct = { id: "", name: "", cost_price: "0", credit_price: "0", is_active: true, reason: "" };
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
  const [product, setProduct] = useState(emptyProduct);
  const [worker, setWorker] = useState(emptyWorker);
  const productInput = useRef<HTMLInputElement>(null);
  const workerInput = useRef<HTMLInputElement>(null);
  const [productFocusRequest, setProductFocusRequest] = useState(0);
  const [workerFocusRequest, setWorkerFocusRequest] = useState(0);
  useEffect(() => { if (productFocusRequest) revealEditor(productInput.current); }, [productFocusRequest]);
  useEffect(() => { if (workerFocusRequest) revealEditor(workerInput.current); }, [workerFocusRequest]);
  const productMutation = useMutation();
  const workerMutation = useMutation();
  const products = resource.data?.products ?? [];
  const workers = resource.data?.workers ?? [];
  const editingProduct = products.find((item) => item.id === product.id);
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await productMutation.run("/api/admin/productos", {
      ...(product.id ? { id: product.id } : {}), name: product.name.trim(), cost_price: Number(product.cost_price),
      credit_price: Number(product.credit_price), is_active: product.is_active ? 1 : 0, reason: product.reason.trim(),
    }, product.id ? "Producto guardado." : "Producto creado. Registra una compra para agregar unidades.");
    if (result) { setProduct(emptyProduct); resource.refresh(); }
  }
  async function saveWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await workerMutation.run("/api/admin/trabajadores", {
      ...(worker.id ? { id: worker.id } : {}), name: worker.name.trim(), email: worker.email.trim().toLowerCase(),
      is_active: worker.is_active ? 1 : 0, reason: worker.reason.trim(),
    }, "Trabajador guardado.");
    if (result) { setWorker(emptyWorker); resource.refresh(); }
  }
  return <AppShell role="ADMIN" title="Bodega y recorridos" subtitle="Controla tus existencias, precios y carga compartida para salir a vender.">
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
        <div className="sc-stat"><small>Total del negocio</small><strong>{products.reduce((sum, item) => sum + item.total_stock, 0)} unidades</strong><small>Bodega y calle</small></div>
        <div className="sc-stat"><small>Asignado en calle</small><strong>{products.reduce((sum, item) => sum + item.reserved_stock, 0)} unidades</strong><small>Sobrantes de recorridos abiertos</small></div>
        <div className="sc-stat"><small>Disponible en casa</small><strong>{products.reduce((sum, item) => sum + item.available_stock, 0)} unidades</strong><small>Libre para el próximo despacho</small></div>
      </div>
      {tab === "products" && <>
        <section className="sc-panel"><div className="sc-section-header"><h2>Productos y margen unitario</h2><button type="button" className="sc-button sc-button-secondary" disabled={productMutation.busy || resource.loading} onClick={() => { setProduct(emptyProduct); productMutation.clear(); setProductFocusRequest((request) => request + 1); }}><Plus size={18} aria-hidden /> Nuevo producto</button></div>
          <p className="sc-muted" style={{ marginBottom: 16 }}>El margen unitario usa el costo actual. Las ventas anteriores conservan el costo que tenían al registrarse.</p>
          {products.length ? <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Producto</th><th scope="col">Costo</th><th scope="col">Precio fiado</th><th scope="col">Margen unitario</th><th scope="col">Total</th><th scope="col">Calle</th><th scope="col">Casa</th><th scope="col">Acción</th></tr></thead><tbody>{products.map((item) => <tr key={item.id}>
            <td data-label="Producto"><div><strong>{item.name}</strong><br /><Badge tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Activo" : "Desactivado"}</Badge></div></td>
            <td data-label="Costo"><Money value={item.cost_price} /></td><td data-label="Precio fiado"><Money value={item.credit_price} /></td><td data-label="Margen unitario"><Money value={item.credit_price - item.cost_price} /></td><td data-label="Total">{item.total_stock}</td><td data-label="Calle">{item.reserved_stock}</td><td data-label="Casa"><strong>{item.available_stock}</strong></td>
            <td data-label="Acción"><button type="button" className="sc-button sc-button-secondary" disabled={productMutation.busy || resource.loading} onClick={() => { setProduct({ id: item.id, name: item.name, cost_price: String(item.cost_price), credit_price: String(item.credit_price), is_active: Boolean(item.is_active), reason: "" }); productMutation.clear(); setProductFocusRequest((request) => request + 1); }}><Pencil size={16} aria-hidden /> Editar</button></td>
          </tr>)}</tbody></table></div> : <Notice>Agrega el primer producto y registra su compra.</Notice>}
        </section>
        <div className="sc-grid">
          <section className="sc-panel" id="product-form"><h2>{product.id ? `Editar ${editingProduct?.name ?? "producto"}` : "Nuevo producto"}</h2><MutationNotice {...productMutation} /><form onSubmit={saveProduct}><fieldset disabled={productMutation.busy || resource.loading}>
            <Field label="Nombre del producto"><input ref={productInput} required maxLength={140} value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></Field>
            <div className="sc-grid"><Field label="Costo actual (COP)"><input type="number" required min="0" step="1" inputMode="numeric" value={product.cost_price} onChange={(event) => setProduct({ ...product, cost_price: event.target.value })} /></Field><Field label="Precio fiado (COP)"><input type="number" required min="0" step="1" inputMode="numeric" value={product.credit_price} onChange={(event) => setProduct({ ...product, credit_price: event.target.value })} /></Field></div>
            <label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" checked={product.is_active} onChange={(event) => setProduct({ ...product, is_active: event.target.checked })} /> Disponible para nuevas ventas</label>
            {!product.is_active && <Notice>Desactivar conserva existencias y ventas anteriores; impide nuevos despachos de este producto.</Notice>}
            <Field label="Motivo del cambio"><textarea required maxLength={500} value={product.reason} onChange={(event) => setProduct({ ...product, reason: event.target.value })} /></Field>
            <div className="sc-actions"><SubmitButton disabled={productMutation.busy}>{productMutation.busy ? "Guardando…" : "Guardar producto"}</SubmitButton>{product.id && <button type="button" className="sc-button sc-button-secondary" onClick={() => { setProduct(emptyProduct); productMutation.clear(); }}>Cancelar edición</button>}</div>
          </fieldset></form></section>
          <StockForm products={products} loading={resource.loading} refresh={resource.refresh} />
        </div>
        <UnusedPhotos loading={resource.loading} />
      </>}
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

function StockForm({ products, loading, refresh }: { products: AdminProduct[]; loading: boolean; refresh: () => void }) {
  const [mode, setMode] = useState<"purchase" | "adjust">("purchase");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation();
  const selected = products.find((product) => product.id === productId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = mode === "purchase" ? { product_id: productId, qty: Number(qty), unit_cost_price: Number(cost), reason: reason.trim() } : { product_id: productId, delta: Number(qty), reason: reason.trim() };
    const result = await mutation.run(mode === "purchase" ? "/api/admin/compras" : "/api/admin/stock", payload, mode === "purchase" ? "Compra registrada." : "Ajuste de existencias registrado.", true);
    if (result) { setQty(""); setReason(""); refresh(); }
  }
  return <section className="sc-panel"><h2><PackagePlus size={20} aria-hidden style={{ display: "inline", marginRight: 8 }} /> Compras y existencias</h2><MutationNotice {...mutation} /><form onSubmit={submit}><fieldset disabled={mutation.busy || loading}>
    <Field label="Operación"><select value={mode} onChange={(event) => { setMode(event.target.value as "purchase" | "adjust"); setQty(""); mutation.clear(); }}><option value="purchase">Registrar compra</option><option value="adjust">Corregir existencias</option></select></Field><Field label="Producto"><select required value={productId} onChange={(event) => { setProductId(event.target.value); setCost(String(products.find((item) => item.id === event.target.value)?.cost_price ?? 0)); }}><option value="">Selecciona un producto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (desactivado)"}</option>)}</select></Field>
    {selected && <p className="sc-muted" style={{ marginBottom: 14 }}>{selected.total_stock} unidades totales · {selected.reserved_stock} en calle · {selected.available_stock} en casa</p>}
    <Field label={mode === "purchase" ? "Unidades compradas" : "Cambio de unidades (+ agrega / − retira)"}><input type="number" required min={mode === "purchase" ? 1 : undefined} step="1" inputMode={mode === "purchase" ? "numeric" : "text"} value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
    {mode === "purchase" && <Field label="Costo unitario de esta compra (COP)"><input type="number" required min="0" step="1" inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} /></Field>}
    <Field label="Motivo o referencia"><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><SubmitButton disabled={mutation.busy || !productId || !qty || (mode === "adjust" && Number(qty) === 0)}>{mutation.busy ? "Registrando…" : mode === "purchase" ? "Registrar compra" : "Guardar ajuste de existencias"}</SubmitButton>
  </fieldset></form></section>;
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
    <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Producto</th><th scope="col">Total</th><th scope="col">En calle</th><th scope="col">En casa</th><th scope="col">Unidades a llevar</th></tr></thead><tbody>{activeProducts.map((item) => <tr key={item.id}><td data-label="Producto"><strong>{item.name}</strong></td><td data-label="Total">{item.total_stock}</td><td data-label="En calle">{item.reserved_stock}</td><td data-label="En casa">{item.available_stock}</td><td data-label="Unidades a llevar"><input aria-label={`Unidades de ${item.name} para el recorrido`} type="number" min="0" max={item.available_stock} step="1" inputMode="numeric" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })} style={{ minWidth: 110, maxWidth: 160 }} /></td></tr>)}</tbody></table></div>
    <SubmitButton disabled={mutation.busy || !activeWorkers.length || !activeProducts.length} style={{ marginTop: 20 }}><Route size={18} aria-hidden />{mutation.busy ? "Creando…" : "Crear y despachar recorrido"}</SubmitButton>
  </fieldset></form></section>;
}
