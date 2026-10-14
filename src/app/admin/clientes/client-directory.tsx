"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownUp, History as HistoryIcon, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { AppShell, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { errorMessage, History, localDate, MutationNotice, ResourceNotice, RoleBoundary, useMutation, useResource } from "../_components";
import { prepareClientSave } from "../_form-model";
import type { ClientCard, Movement } from "../_types";

interface PortfolioData { clients: ClientCard[]; portfolio_total: number; estimated_margin: number; inherited_balance: number }
interface AuditEntry { id?: string; action?: string; reason?: string; created_at?: string; actor_name?: string; previous_json?: string | null; next_json?: string | null }
interface ClientDetail { client: ClientCard; history: Movement[]; audit: AuditEntry[] }
const blankForm = { id: "", name: "", address: "", address_reference: "", route_order: "", linked_email: "", is_active: true, reason: "", opening_balance: "0" };

export default function ClientsPage({ initialClientId = "", initialAdjustmentDelta = "", initialAdjustmentReason = "" }: { initialClientId?: string; initialAdjustmentDelta?: string; initialAdjustmentReason?: string }) {
  return <RoleBoundary role="ADMIN"><ClientDirectory initialClientId={initialClientId} initialAdjustmentDelta={initialAdjustmentDelta} initialAdjustmentReason={initialAdjustmentReason} /></RoleBoundary>;
}

function ClientDirectory({ initialClientId, initialAdjustmentDelta, initialAdjustmentReason }: { initialClientId: string; initialAdjustmentDelta: string; initialAdjustmentReason: string }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [period, setPeriod] = useState("");
  const [periodError, setPeriodError] = useState(""); const [search, setSearch] = useState(""); const [showInactive, setShowInactive] = useState(true);
  const resource = useResource<PortfolioData>(`/api/admin/clientes${period}`);
  const [form, setForm] = useState(blankForm); const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState("");
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialClientId);
  const detail = useResource<ClientDetail>(`/api/admin/clientes/${encodeURIComponent(selectedId)}`, Boolean(selectedId));
  const mutation = useMutation();
  const scrolledClient = useRef("");
  useEffect(() => {
    if (!selectedId) { scrolledClient.current = ""; return; }
    if (detail.data && !resource.loading && scrolledClient.current !== selectedId) {
      document.getElementById("client-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledClient.current = selectedId;
    }
  }, [selectedId, detail.data, resource.loading]);
  const clients = resource.data?.clients ?? [];
  const term = search.trim().toLocaleLowerCase("es-CO").replace(/^#/, "");
  const filtered = clients.filter((client) => (showInactive || client.is_active) && (!term || [client.name, client.address, client.address_reference, String(client.route_order), client.linked_email ?? ""].some((value) => value.toLocaleLowerCase("es-CO").includes(term))));
  function editClient(client: ClientCard) {
    setForm({ id: client.id, name: client.name, address: client.address, address_reference: client.address_reference, route_order: String(client.route_order), linked_email: client.linked_email ?? "", is_active: Boolean(client.is_active), reason: "", opening_balance: "0" });
    setOriginalEmail(client.linked_email); setEditing(true); setFormError(""); mutation.clear();
  }
  function newClient() { setForm(blankForm); setOriginalEmail(null); setEditing(true); setFormError(""); mutation.clear(); }
  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPeriodError("");
    if (from && to && from > to) { setPeriodError("La fecha inicial debe ser anterior o igual a la fecha final."); return; }
    const query = new URLSearchParams(); if (from) query.set("from", from); if (to) query.set("to", to);
    setPeriod(query.size ? `?${query}` : "");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    try {
      const result = await mutation.run<{ id: string }>("/api/admin/clientes", prepareClientSave(form), form.id ? "Tarjeta guardada. Los cambios quedaron registrados." : "Tarjeta creada y saldo de apertura registrado.", !form.id);
      if (result) { setSelectedId(result.id); setEditing(false); setForm(blankForm); resource.refresh(); if (result.id === selectedId) detail.refresh(); }
    } catch (error) { setFormError(errorMessage(error)); }
  }
  return <AppShell role="ADMIN" title="Tarjetas y cartera" subtitle="Conserva el orden de las tarjetas físicas y explica cada cambio del saldo.">
    <section className="sc-panel"><h2>Margen por período</h2><form onSubmit={applyPeriod}><div className="sc-actions" style={{ alignItems: "end" }}><div style={{ flex: "1 1 180px" }}><Field label="Desde"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field></div><div style={{ flex: "1 1 180px" }}><Field label="Hasta"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field></div><SubmitButton style={{ marginBottom: 14 }} disabled={resource.loading}>Consultar período</SubmitButton><button type="button" className="sc-button sc-button-secondary" style={{ marginBottom: 14 }} onClick={() => { setFrom(""); setTo(""); setPeriod(""); setPeriodError(""); }}>Todo el historial</button></div></form>{periodError && <Notice tone="error">{periodError}</Notice>}<p className="sc-muted">La cartera muestra el saldo pendiente actual; las aperturas heredadas conservan su importe original. El período filtra el margen de ventas registradas. Los ajustes de saldo no generan margen.</p></section>
    <ResourceNotice {...resource} /><MutationNotice {...mutation} />{formError && <Notice tone="error">{formError}</Notice>}
    {resource.data && <div className="sc-grid"><div className="sc-stat"><small>Cartera actual</small><strong><Money value={resource.data.portfolio_total} /></strong><small>Saldo de las tarjetas activas</small></div><div className="sc-stat"><small>Margen estimado de ventas registradas</small><strong><Money value={resource.data.estimated_margin} /></strong><small>{period ? "Período consultado" : "Todo el historial"} · precio fiado menos costo al vender</small></div><div className="sc-stat"><small>Aperturas heredadas sin detalle</small><strong><Money value={resource.data.inherited_balance} /></strong><small>Importe original de las aperturas, sin margen calculable</small></div></div>}
    {editing && resource.data && <section className="sc-panel" aria-labelledby="client-editor"><div className="sc-actions" style={{ justifyContent: "space-between" }}><h2 id="client-editor">{form.id ? "Editar tarjeta" : "Nueva tarjeta"}</h2><button type="button" className="sc-icon-button" disabled={mutation.busy} aria-label="Cerrar edición de tarjeta" onClick={() => setEditing(false)}><X size={20} /></button></div><form onSubmit={save}><fieldset disabled={mutation.busy || resource.loading}><div className="sc-grid"><Field label="Nombre del cliente"><input required maxLength={140} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Dirección"><input required maxLength={240} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field><Field label="Referencia de la casa"><input required maxLength={240} value={form.address_reference} onChange={(event) => setForm({ ...form, address_reference: event.target.value })} /></Field><Field label="Correo Google vinculado (opcional)"><input type="email" maxLength={254} value={form.linked_email} onChange={(event) => setForm({ ...form, linked_email: event.target.value })} /></Field>{form.id && <Field label="Número en el orden de tarjetas"><input type="number" required min="1" step="1" inputMode="numeric" value={form.route_order} onChange={(event) => setForm({ ...form, route_order: event.target.value })} /></Field>}</div>
      {form.id ? <p className="sc-muted" style={{ marginBottom: 16 }}>Si el número está ocupado, las dos tarjetas intercambian su posición al guardar.</p> : <><Field label="Saldo de apertura de tarjeta física (COP)"><input type="number" required step="1" inputMode="text" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} /></Field><Notice>Se asignará el siguiente número disponible. El saldo original quedará registrado como apertura: usa cero si la tarjeta está al día o un importe negativo si el cliente tiene saldo a favor.</Notice></>}
      {form.id && (form.linked_email.trim().toLowerCase() || null) !== originalEmail && <Notice>Al cambiar el correo se revoca el vínculo anterior. El cliente tendrá que entrar con la nueva cuenta Google autorizada. Describe el motivo de este cambio.</Notice>}
      <label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Tarjeta activa</label>{!form.is_active && <Notice>La tarjeta conservará su historial y saldo; el cliente perderá el acceso y dejará de aparecer en la ruta activa.</Notice>}<Field label="Motivo del alta o cambio"><textarea required maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field><SubmitButton disabled={mutation.busy}>{mutation.busy ? "Guardando…" : "Guardar tarjeta"}</SubmitButton>
    </fieldset></form></section>}
    <section className="sc-panel"><div className="sc-actions" style={{ justifyContent: "space-between", marginBottom: 16 }}><h2>Directorio maestro</h2><div className="sc-actions"><button type="button" className="sc-button" disabled={mutation.busy} onClick={newClient}><Plus size={18} aria-hidden /> Nueva tarjeta</button><button type="button" className="sc-icon-button" disabled={resource.loading} aria-label="Actualizar directorio" onClick={resource.refresh}><RefreshCw size={20} /></button></div></div><Field label="Buscar nombre, dirección, número o correo"><div style={{ display: "flex", gap: 10, alignItems: "center" }}><Search size={20} aria-hidden /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div></Field><label className="sc-actions" style={{ minHeight: 48, marginBottom: 12 }}><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Incluir tarjetas desactivadas</label><p className="sc-muted" style={{ marginBottom: 12 }}>{filtered.length} tarjetas</p>
      {filtered.length ? <div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Orden</th><th>Cliente y dirección</th><th>Saldo actual</th><th>Cuenta vinculada</th><th>Acciones</th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><span className="sc-badge" style={{ fontSize: 16 }}>#{client.route_order}</span></td><td><strong>{client.name}</strong><p>{client.address}</p><small>{client.address_reference}</small>{!client.is_active && <p><span className="sc-badge">Desactivada</span></p>}</td><td><Money value={Math.abs(client.current_balance)} />{client.current_balance < 0 && <p><strong>Saldo a favor</strong></p>}</td><td>{client.linked_email ?? "Sin correo"}</td><td><div className="sc-actions"><button type="button" className="sc-button sc-button-secondary" disabled={mutation.busy} onClick={() => editClient(client)}><Pencil size={16} aria-hidden /> Editar</button><button type="button" className="sc-button sc-button-secondary" onClick={() => setSelectedId(client.id)}><HistoryIcon size={16} aria-hidden /> Historial y saldo</button></div></td></tr>)}</tbody></table></div> : !resource.loading && <Notice>{clients.length ? "No hay tarjetas que coincidan con la búsqueda." : "Todavía no hay tarjetas registradas."}</Notice>}
    </section>
    {selectedId && <section aria-labelledby="client-detail"><div className="sc-actions" style={{ justifyContent: "space-between", marginBottom: 16 }}><h2 id="client-detail" style={{ fontSize: 24, fontWeight: 800 }}>Historial y saldo de la tarjeta</h2><div className="sc-actions"><button type="button" className="sc-icon-button" aria-label="Actualizar historial" disabled={detail.loading} onClick={detail.refresh}><RefreshCw size={20} /></button><button type="button" className="sc-button sc-button-secondary" onClick={() => setSelectedId("")}><X size={18} aria-hidden /> Cerrar historial</button></div></div><ResourceNotice {...detail} />{detail.data && <>
      <section className="sc-panel"><span className="sc-badge">#{detail.data.client.route_order}</span><h3 style={{ marginTop: 10 }}>{detail.data.client.name}</h3><p>{detail.data.client.address} · {detail.data.client.address_reference}</p><p style={{ fontSize: 24, fontWeight: 800, marginTop: 12 }}>{detail.data.client.current_balance < 0 ? "Saldo a favor " : "Saldo pendiente "}<Money value={Math.abs(detail.data.client.current_balance)} /></p></section>
      <AdjustmentForm key={detail.data.client.id} client={detail.data.client} initialDelta={selectedId === initialClientId ? initialAdjustmentDelta : ""} initialReason={selectedId === initialClientId ? initialAdjustmentReason : ""} loading={detail.loading} refresh={() => { detail.refresh(); resource.refresh(); }} />
      <History movements={detail.data.history} showAdjustmentIds />
      <section className="sc-panel"><h3>Cambios administrativos</h3>{detail.data.audit.length ? <ul>{detail.data.audit.map((entry, index) => <li key={entry.id ?? index} style={{ paddingBlock: 12, borderBottom: "1px solid #dce4e8" }}><strong>{entry.action?.replaceAll("_", " ") ?? "Cambio de tarjeta"}</strong>{entry.created_at && <p className="sc-muted">{localDate(entry.created_at, true)}{entry.actor_name ? ` · ${entry.actor_name}` : ""}</p>}<p>{entry.reason ?? "Sin nota adicional"}</p>{(entry.previous_json || entry.next_json) && <details style={{ marginTop: 8 }}><summary style={{ minHeight: 48, cursor: "pointer" }}>Ver valores anteriores y nuevos</summary><AuditSnapshot label="Antes" raw={entry.previous_json} /><AuditSnapshot label="Después" raw={entry.next_json} /></details>}</li>)}</ul> : <Notice>No hay cambios administrativos adicionales.</Notice>}</section>
    </>}</section>}
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
