"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownUp, ArrowLeft, Filter, History as HistoryIcon, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { AppShell, Badge, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { errorMessage, History, localDate, MutationNotice, ResourceNotice, RoleBoundary, useMutation, useResource } from "../_components";
import { prepareClientSave } from "../_form-model";
import type { AdminProduct, ClientCard, Movement } from "../_types";
import OpeningDebt from "./opening-debt";
import type { OpeningDraftItem } from "./opening-model";

interface PortfolioData { clients: ClientCard[]; portfolio_total: number; estimated_margin: number; inherited_balance: number }
interface AuditEntry { id?: string; action?: string; reason?: string; created_at?: string; actor_name?: string; previous_json?: string | null; next_json?: string | null }
interface ClientDetail { client: ClientCard; history: Movement[]; audit: AuditEntry[] }
const blankForm = { id: "", name: "", address: "", address_reference: "", route_order: "", linked_email: "", is_active: true, opening_balance: "0", opening_items: [] as OpeningDraftItem[] };

export default function ClientsPage({ initialClientId = "", initialAdjustmentDelta = "", initialAdjustmentReason = "" }: { initialClientId?: string; initialAdjustmentDelta?: string; initialAdjustmentReason?: string }) {
  return <RoleBoundary role="ADMIN"><ClientDirectory initialClientId={initialClientId} initialAdjustmentDelta={initialAdjustmentDelta} initialAdjustmentReason={initialAdjustmentReason} /></RoleBoundary>;
}

function ClientDirectory({ initialClientId, initialAdjustmentDelta, initialAdjustmentReason }: { initialClientId: string; initialAdjustmentDelta: string; initialAdjustmentReason: string }) {
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [period, setPeriod] = useState("");
  const [periodError, setPeriodError] = useState(""), [search, setSearch] = useState(""), [showInactive, setShowInactive] = useState(true);
  const resource = useResource<PortfolioData>(`/api/admin/clientes${period}`);
  const [form, setForm] = useState(blankForm), [editing, setEditing] = useState(false);
  const inventory = useResource<{ products: AdminProduct[] }>("/api/admin/inventario", editing && !form.id);
  const [formError, setFormError] = useState("");
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialClientId);
  const detail = useResource<ClientDetail>(`/api/admin/clientes/${encodeURIComponent(selectedId)}`, Boolean(selectedId) && !editing);
  const mutation = useMutation();
  const locked = mutation.busy || mutation.uncertain;
  const scrolledClient = useRef("");
  const editorInput = useRef<HTMLInputElement>(null), detailHeading = useRef<HTMLHeadingElement>(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const newButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!editorFocusRequest || !editorInput.current || resource.loading || inventory.loading) return;
    editorInput.current.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [editorFocusRequest, resource.loading, inventory.loading]);
  useEffect(() => {
    if (!selectedId) { scrolledClient.current = ""; return; }
    if (!editing && detail.data && !resource.loading && scrolledClient.current !== selectedId) {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      scrolledClient.current = selectedId;
    }
  }, [selectedId, detail.data, resource.loading, editing]);
  const clients = resource.data?.clients ?? [];
  const term = search.trim().toLocaleLowerCase("es-CO").replace(/^#/, "");
  const filtered = clients.filter((client) => (showInactive || client.is_active) && (!term || [client.name, client.address, client.address_reference, String(client.route_order), client.linked_email ?? ""].some((value) => value.toLocaleLowerCase("es-CO").includes(term))));
  function editClient(client: ClientCard) {
    setForm({ id: client.id, name: client.name, address: client.address, address_reference: client.address_reference, route_order: String(client.route_order), linked_email: client.linked_email ?? "", is_active: Boolean(client.is_active), opening_balance: "0", opening_items: [] });
    setOriginalEmail(client.linked_email); setEditing(true); setFormError(""); mutation.clear(); setEditorFocusRequest((request) => request + 1);
  }
  function newClient() { setForm(blankForm); setOriginalEmail(null); setEditing(true); setFormError(""); mutation.clear(); setEditorFocusRequest((request) => request + 1); }
  function closeEditor() { if (locked) return; setEditing(false); setFormError(""); requestAnimationFrame(() => newButton.current?.focus()); }
  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPeriodError("");
    if (from && to && from > to) { setPeriodError("La fecha inicial debe ser anterior o igual a la fecha final."); return; }
    const query = new URLSearchParams(); if (from) query.set("from", from); if (to) query.set("to", to);
    setPeriod(query.size ? `?${query}` : "");
  }
  async function saveCard() {
    setFormError("");
    try {
      const result = await mutation.run<{ id: string }>("/api/admin/clientes", prepareClientSave(form), form.id ? "Tarjeta guardada." : "Tarjeta creada.", true);
      if (result) { setSelectedId(result.id); scrolledClient.current = ""; setEditing(false); setForm(blankForm); resource.refresh(); if (result.id === selectedId) detail.refresh(); }
    } catch (error) { setFormError(errorMessage(error)); }
  }
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void saveCard(); }

  return <AppShell role="ADMIN" title={editing ? form.id ? "Editar tarjeta" : "Nueva tarjeta" : "Tarjetas y cartera"} subtitle={editing ? "Datos del cliente y deuda que tenía al iniciar." : "Consulta lo que te deben y el historial de cada cliente."}>
    <MutationNotice {...mutation} />{formError && <Notice tone="error">{formError}</Notice>}
    {editing ? <>
      <button type="button" className="sc-button sc-button-secondary sc-card-back" disabled={locked} onClick={closeEditor}><ArrowLeft size={18} aria-hidden /> Volver a tarjetas</button>
      {!form.id && <ResourceNotice {...inventory} />}
      {mutation.uncertain && <Notice tone="warning">No pudimos confirmar el guardado. Conservamos los datos para reintentar la misma tarjeta. <button type="button" className="sc-button sc-button-secondary" disabled={mutation.busy} onClick={() => void saveCard()}>Reintentar guardado</button></Notice>}
      <section className="sc-panel" aria-labelledby="client-editor"><h2 id="client-editor">Datos del cliente</h2><form onSubmit={save}><fieldset disabled={locked || resource.loading || (!form.id && inventory.loading)}>
        <div className="sc-grid"><Field label="Nombre del cliente"><input ref={editorInput} required maxLength={140} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Dirección"><input required maxLength={240} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field><Field label="Referencia de la casa"><input required maxLength={240} value={form.address_reference} onChange={(event) => setForm({ ...form, address_reference: event.target.value })} /></Field><Field label="Correo Google vinculado (opcional)"><input type="email" maxLength={254} value={form.linked_email} onChange={(event) => setForm({ ...form, linked_email: event.target.value })} /></Field></div>
        {form.id ? <><Field label="Número en el orden de tarjetas"><input type="number" required min="1" step="1" inputMode="numeric" value={form.route_order} onChange={(event) => setForm({ ...form, route_order: event.target.value })} /></Field><p className="sc-muted sc-card-help">Si el número está ocupado, las dos tarjetas intercambian su posición al guardar. La deuda inicial conserva sus productos; las correcciones de saldo se registran desde el historial.</p></> : <OpeningDebt products={inventory.data?.products ?? []} value={form.opening_items} onChange={(opening_items) => setForm((previous) => ({ ...previous, opening_items, opening_balance: "0" }))} balance={form.opening_balance} onBalanceChange={(opening_balance) => setForm((previous) => ({ ...previous, opening_balance }))} />}
        {form.id && (form.linked_email.trim().toLowerCase() || null) !== originalEmail && <Notice>Al cambiar el correo, el cliente deberá entrar con la nueva cuenta Google autorizada. El cambio quedará registrado.</Notice>}
        <label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Tarjeta activa</label>{!form.is_active && <Notice>Conserva su historial y saldo; el cliente perderá el acceso y no aparecerá en la ruta activa.</Notice>}
        <SubmitButton disabled={locked}>{mutation.busy ? "Guardando…" : "Guardar tarjeta"}</SubmitButton>
      </fieldset></form></section>
    </> : <>
      <ResourceNotice {...resource} />
      {resource.data && <div className="sc-grid sc-stats-grid"><div className="sc-stat"><small>Deuda pendiente</small><strong><Money value={resource.data.portfolio_total} /></strong><small>Lo que deben actualmente los clientes activos</small></div><div className="sc-stat"><small>Ganancia de ventas</small><strong><Money value={resource.data.estimated_margin} /></strong><small>{period ? "Período filtrado" : "Todas las ventas registradas"} · precio fiado menos costo de esas ventas</small></div></div>}
      <section className="sc-panel"><div className="sc-section-header"><h2>Tarjetas</h2><div className="sc-actions"><button ref={newButton} type="button" className="sc-button" disabled={locked || resource.loading} onClick={newClient}><Plus size={18} aria-hidden /> Nueva tarjeta</button><button type="button" className="sc-icon-button" disabled={resource.loading} aria-label="Actualizar directorio" onClick={resource.refresh}><RefreshCw size={20} /></button></div></div>
        <div className="sc-filter-bar"><Field label="Buscar nombre, dirección, número o correo"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><Search size={20} aria-hidden /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div></Field><label className="sc-actions" style={{ minHeight: 48 }}><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Incluir tarjetas desactivadas</label></div>
        <details className="sc-card-period"><summary><Filter size={17} aria-hidden /><span>Filtrar ganancia</span>{period && <Badge tone="info">Filtro activo</Badge>}</summary><form onSubmit={applyPeriod}><div className="sc-actions" style={{ alignItems: "end" }}><Field label="Desde"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="Hasta"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><SubmitButton disabled={resource.loading}>Aplicar filtro</SubmitButton><button type="button" className="sc-button sc-button-secondary" onClick={() => { setFrom(""); setTo(""); setPeriod(""); setPeriodError(""); }}>Quitar filtro</button></div></form>{periodError && <Notice tone="error">{periodError}</Notice>}<p className="sc-muted">El período filtra la ganancia de ventas. La deuda pendiente siempre muestra el saldo actual. Los saldos anteriores al uso de la app no se cuentan como ventas nuevas.</p></details>
        <p className="sc-muted sc-card-count">{filtered.length} tarjetas</p>
        {filtered.length ? <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Orden</th><th scope="col">Cliente y dirección</th><th scope="col">Saldo actual</th><th scope="col">Cuenta vinculada</th><th scope="col">Acciones</th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td data-label="Orden"><Badge tone="info">#{client.route_order}</Badge></td><td data-label="Cliente y dirección"><div><strong>{client.name}</strong><p>{client.address}</p><small>{client.address_reference}</small>{!client.is_active && <p><Badge tone="neutral">Desactivada</Badge></p>}</div></td><td data-label="Saldo actual"><div><Money value={Math.abs(client.current_balance)} />{client.current_balance < 0 && <p><strong>Saldo a favor</strong></p>}</div></td><td data-label="Cuenta vinculada">{client.linked_email ?? "Sin correo"}</td><td data-label="Acciones"><div className="sc-actions"><button type="button" className="sc-button sc-button-secondary" disabled={locked || resource.loading} onClick={() => editClient(client)}><Pencil size={16} aria-hidden /> Editar</button><button type="button" className="sc-button sc-button-secondary" onClick={() => setSelectedId(client.id)}><HistoryIcon size={16} aria-hidden /> Historial y saldo</button></div></td></tr>)}</tbody></table></div> : !resource.loading && <Notice>{clients.length ? "No hay tarjetas que coincidan con la búsqueda." : "Todavía no hay tarjetas registradas."}</Notice>}
      </section>
      {selectedId && <section aria-labelledby="client-detail"><div className="sc-section-header"><h2 ref={detailHeading} tabIndex={-1} id="client-detail" style={{ fontSize: 24, fontWeight: 800 }}>Historial y saldo de la tarjeta</h2><div className="sc-actions"><button type="button" className="sc-icon-button" aria-label="Actualizar historial" disabled={detail.loading} onClick={detail.refresh}><RefreshCw size={20} /></button><button type="button" className="sc-button sc-button-secondary" onClick={() => setSelectedId("")}><X size={18} aria-hidden /> Cerrar historial</button></div></div><ResourceNotice {...detail} />{detail.data && <>
        <section className="sc-panel"><Badge tone="info">#{detail.data.client.route_order}</Badge><h3 style={{ marginTop: 10 }}>{detail.data.client.name}</h3><p>{detail.data.client.address} · {detail.data.client.address_reference}</p><p style={{ fontSize: 24, fontWeight: 800, marginTop: 12 }}>{detail.data.client.current_balance < 0 ? "Saldo a favor " : "Saldo pendiente "}<Money value={Math.abs(detail.data.client.current_balance)} /></p></section>
        <AdjustmentForm key={detail.data.client.id} client={detail.data.client} initialDelta={selectedId === initialClientId ? initialAdjustmentDelta : ""} initialReason={selectedId === initialClientId ? initialAdjustmentReason : ""} loading={detail.loading} refresh={() => { detail.refresh(); resource.refresh(); }} />
        <History movements={detail.data.history} showAdjustmentIds />
        <section className="sc-panel"><h3>Cambios administrativos</h3>{detail.data.audit.length ? <ul>{detail.data.audit.map((entry, index) => <li key={entry.id ?? index} style={{ paddingBlock: 12, borderBottom: "1px solid #dce4e8" }}><strong>{entry.action?.replaceAll("_", " ") ?? "Cambio de tarjeta"}</strong>{entry.created_at && <p className="sc-muted">{localDate(entry.created_at, true)}{entry.actor_name ? ` · ${entry.actor_name}` : ""}</p>}<p>{entry.reason ?? "Sin nota adicional"}</p>{(entry.previous_json || entry.next_json) && <details style={{ marginTop: 8 }}><summary style={{ minHeight: 48, cursor: "pointer" }}>Ver valores anteriores y nuevos</summary><AuditSnapshot label="Antes" raw={entry.previous_json} /><AuditSnapshot label="Después" raw={entry.next_json} /></details>}</li>)}</ul> : <Notice>No hay cambios administrativos adicionales.</Notice>}</section>
      </>}</section>}
    </>}
  </AppShell>;
}

function AdjustmentForm({ client, initialDelta = "", initialReason = "", loading, refresh }: { client: ClientCard; initialDelta?: string; initialReason?: string; loading: boolean; refresh: () => void }) {
  const [delta, setDelta] = useState(initialDelta); const [reason, setReason] = useState(initialReason); const mutation = useMutation();
  const amount = Number(delta); const valid = delta.trim() && Number.isSafeInteger(amount) && amount !== 0;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutation.run("/api/admin/ajustes", { client_id: client.id, expected_revision: client.revision, delta: amount, reason: reason.trim() }, "Ajuste registrado en el historial.", true);
    if (result) { setDelta(""); setReason(""); refresh(); }
  }
  return <section className="sc-panel"><h3><ArrowDownUp size={20} aria-hidden style={{ display: "inline", marginRight: 8 }} /> Cargar o corregir saldo con un ajuste</h3><p className="sc-muted" style={{ marginBottom: 14 }}>Escribe cuánto cambia el saldo: positivo agrega deuda; negativo reduce deuda. El saldo original de la tarjeta física se registra al crearla; los cambios posteriores se registran aquí como correcciones.</p><MutationNotice {...mutation} /><form onSubmit={submit}><fieldset disabled={mutation.busy || loading}><div className="sc-grid"><Field label="Cambio del saldo (COP, con signo)"><input type="number" required step="1" inputMode="text" value={delta} onChange={(event) => setDelta(event.target.value)} /></Field><div className="sc-stat"><small>Saldo después del ajuste</small><strong><Money value={Math.abs(client.current_balance + (Number.isFinite(amount) ? amount : 0))} /></strong>{client.current_balance + (Number.isFinite(amount) ? amount : 0) < 0 && <small>Saldo a favor</small>}</div></div><Field label="Motivo de la corrección"><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><SubmitButton disabled={mutation.busy || !valid || !reason.trim()}>{mutation.busy ? "Registrando…" : "Registrar ajuste"}</SubmitButton></fieldset></form></section>;
}

function AuditSnapshot({ label, raw }: { label: string; raw?: string | null }) {
  if (!raw) return null;
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return null; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const values = parsed as Record<string, unknown>;
  const labels: Record<string, string> = { name: "Nombre", address: "Dirección", address_reference: "Referencia", route_order: "Orden", linked_email: "Correo", is_active: "Activa", current_balance: "Saldo" };
  return <div style={{ marginBottom: 12 }}><strong>{label}</strong><dl>{Object.entries(labels).filter(([key]) => key in values).map(([key, name]) => <div key={key}><dt style={{ display: "inline", fontWeight: 700 }}>{name}: </dt><dd style={{ display: "inline" }}>{key === "current_balance" && typeof values[key] === "number" ? <Money value={values[key] as number} /> : key === "is_active" ? values[key] ? "Sí" : "No" : String(values[key] ?? "Sin correo")}</dd></div>)}</dl></div>;
}
