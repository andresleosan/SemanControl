"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Link2, Minus, Plus, QrCode, X } from "lucide-react";
import { AppShell, Field, Money, Notice } from "@/components/ui";
import { api, apiBlob, ClientApiError, useSession } from "@/lib/client-api";
import type { Principal } from "@/lib/contracts";
import { compressReceipt } from "@/lib/image-compression";
import type { QueueRecord } from "@/lib/offline/queue";
import { readLocal, removeDraft, routeQueue, saveLocal } from "@/lib/offline/storage";
import { reportRouteIncident, syncRoute } from "@/lib/offline/sync";
import { PendingDetail, QueueStatus, errorText, useQueue, type ClientData } from "../../route-shared";

interface VisitDraft { payment: string; method: "CASH" | "TRANSFER"; quantities: Record<string, number>; photo?: Blob; exceptional?: boolean; readable: boolean; accepted: boolean }
const blank = (): VisitDraft => ({ payment: "", method: "CASH", quantities: {}, readable: false, accepted: false });

export default function VisitView({ id, dispatch, session, onBack }: { id: string; dispatch: string; session?: Principal; onBack?: () => void }) {
  const sessionState = useSession();
  const user = session ?? sessionState.user, uid = user?.firebaseUid;
  const owner = `${uid ?? ""}:${dispatch}:${id}`, scope = `client:${dispatch}:${id}`;
  const [state, setState] = useState<{ owner: string; data: ClientData | null; observed: string | null; error: string | null }>({ owner: "", data: null, observed: null, error: null });
  const [draftState, setDraftState] = useState<{ owner: string; loaded: boolean; value: VisitDraft }>({ owner: "", loaded: false, value: blank() });
  const [saving, setSaving] = useState(false), [photoBusy, setPhotoBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [formError, setFormError] = useState<string | null>(null);
  const [savedVisit, setSavedVisit] = useState(false), [previewState, setPreviewState] = useState<{ owner: string; photo?: Blob; url: string | null }>({ owner: "", url: null });
  const [linking, setLinking] = useState(false), [linkBusy, setLinkBusy] = useState(false), [linkEmail, setLinkEmail] = useState("");
  const [link, setLink] = useState<{ owner: string; url: string; expires_at: string; image: string } | null>(null), [linkError, setLinkError] = useState<string | null>(null);
  const [reviewState, setReview] = useState<{ owner: string; row: QueueRecord; fresh: ClientData } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), saveLock = useRef(false), activeOwner = useRef(owner);
  useEffect(() => { activeOwner.current = owner; }, [owner]);
  const data = state.owner === owner ? state.data : null;
  const draft = draftState.owner === owner ? draftState.value : blank();
  const preview = previewState.owner === owner && previewState.photo === draft.photo ? previewState.url : null;
  const review = reviewState?.owner === owner ? reviewState : null;
  const update = (change: Partial<VisitDraft>) => setDraftState((previous) => ({ owner, loaded: previous.owner === owner && previous.loaded, value: { ...(previous.owner === owner ? previous.value : blank()), ...change } }));
  const load = useCallback(async () => {
    if (!uid || !dispatch) return;
    try {
      const next = await api<ClientData>(`/api/ruta/cliente/${encodeURIComponent(id)}?dispatch_id=${encodeURIComponent(dispatch)}`);
      await saveLocal("snapshots", uid, scope, next);
      if (activeOwner.current === owner) setState({ owner, data: next, observed: null, error: null });
    } catch (error) {
      const denied = error instanceof ClientApiError && [401, 403].includes(error.status);
      const saved = denied ? null : await readLocal<ClientData>("snapshots", uid, scope).catch(() => null);
      if (activeOwner.current === owner) setState({ owner, data: saved?.value ?? null, observed: saved?.observed_at ?? null, error: saved ? null : errorText(error) });
    }
  }, [uid, dispatch, id, scope, owner]);
  const queue = useQueue(uid, dispatch, () => void load());
  const ownRows = queue.rows.filter((row) => row.payload.client_id === id);
  const blocking = ownRows.some((row) => row.state !== "registered" && !row.resolved_by);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!uid || !dispatch) return;
    let alive = true;
    readLocal<VisitDraft>("drafts", uid, scope).then((saved) => { if (alive) setDraftState({ owner, loaded: true, value: saved?.value ?? blank() }); }).catch((error) => { if (alive) { setFormError(errorText(error)); setDraftState({ owner, loaded: true, value: blank() }); } });
    return () => { alive = false; };
  }, [uid, dispatch, scope, owner]);
  useEffect(() => {
    if (!uid || !draftState.loaded || draftState.owner !== owner || savedVisit) return;
    const timer = window.setTimeout(() => { void saveLocal("drafts", uid, scope, draftState.value).catch((error) => { if (activeOwner.current === owner) setFormError(errorText(error)); }); }, 250);
    return () => window.clearTimeout(timer);
  }, [uid, scope, owner, draftState, savedVisit]);
  useEffect(() => {
    const photo = draftState.owner === owner ? draftState.value.photo : undefined;
    let alive = true;
    const url = photo ? URL.createObjectURL(photo) : null;
    queueMicrotask(() => { if (alive) setPreviewState({ owner, photo, url }); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [draftState.owner, draftState.value.photo, owner]);
  useEffect(() => { if (linking) dialog.current?.showModal(); else dialog.current?.close(); }, [linking]);
  useEffect(() => { return () => { if (link?.image) URL.revokeObjectURL(link.image); }; }, [link]);

  const payment = draft.payment === "" ? 0 : Number(draft.payment);
  const items = data?.inventory.filter((product) => (draft.quantities[product.id] ?? 0) > 0).map((product) => ({ product_id: product.id, qty: draft.quantities[product.id], unit_credit_price: product.credit_price })) ?? [];
  const charge = items.reduce((total, item) => total + item.qty * item.unit_credit_price, 0), balance = (data?.client.current_balance ?? 0) - payment + charge;
  const valid = Number.isSafeInteger(payment) && payment >= 0 && Number.isSafeInteger(charge) && Number.isSafeInteger(balance);
  const closed = data?.dispatch_status === "CLOSED";
  const locked = saving || photoBusy || blocking || savedVisit || !draftState.loaded || closed;

  async function choosePhoto(file?: File) {
    if (!file) return;
    const capturedOwner = owner;
    setPhotoBusy(true); setFormError(null);
    try {
      const result = await compressReceipt(file, draft.readable);
      if (activeOwner.current === capturedOwner) update({ photo: result.blob, exceptional: result.exceptional, accepted: false });
    } catch (error) { if (activeOwner.current === capturedOwner) setFormError(errorText(error)); }
    finally { if (activeOwner.current === capturedOwner) setPhotoBusy(false); }
  }
  async function saveVisit(event: React.FormEvent) {
    event.preventDefault();
    if (!uid || !data || locked || saveLock.current) return;
    if (!valid) { setFormError("Escribe un abono en pesos enteros y cantidades válidas."); return; }
    if (payment > 0 && draft.method === "TRANSFER" && (!draft.photo || !draft.accepted)) { setFormError("Revisa la foto y confirma que se leen los datos bancarios."); return; }
    saveLock.current = true; setSaving(true); setFormError(null); setMessage(null);
    try {
      const transferring = payment > 0 && draft.method === "TRANSFER";
      const row = await routeQueue.enqueue(uid, {
        idempotency_key: crypto.randomUUID(), dispatch_id: dispatch, client_id: id,
        expected_revision: data.client.revision, expected_balance: data.client.current_balance,
        payment_amount: payment, payment_method: payment === 0 ? "NONE" : draft.method,
        receipt_id: transferring ? crypto.randomUUID() : null, items,
      }, transferring ? draft.photo : undefined);
      // Local durability precedes every upload and accounting request.
      setSavedVisit(true);
      await removeDraft(uid, scope);
      setDraftState({ owner, loaded: true, value: blank() });
      window.dispatchEvent(new Event("semancontrol-queue"));
      await syncRoute(uid, dispatch);
      await queue.refresh();
      const persisted = (await routeQueue.list(uid, dispatch)).find((candidate) => candidate.key === row.key);
      setMessage(persisted?.state === "registered" ? "Visita registrada por el servidor." : persisted?.state === "conflict" ? "Conservamos la visita y el cobro físico. Revisa la incidencia antes de confirmar nuevamente." : "Visita conservada en este teléfono. Pendiente de sincronizar.");
      if (persisted?.state === "registered") await load();
    } catch (error) { setFormError(errorText(error)); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function makeLink(event: React.FormEvent) {
    event.preventDefault(); const capturedOwner = owner; setLinkBusy(true); setLinkError(null);
    try {
      const next = await api<{ url: string; expires_at: string }>("/api/vinculo", { method: "POST", body: JSON.stringify({ client_id: id, dispatch_id: dispatch, ...(linkEmail.trim() ? { linked_email: linkEmail.trim() } : {}) }) });
      const svg = await apiBlob(`/api/vinculo/qr?data=${encodeURIComponent(next.url)}`);
      if (activeOwner.current === capturedOwner) setLink({ owner, ...next, image: URL.createObjectURL(svg) });
    } catch (error) { setLinkError(errorText(error)); } finally { setLinkBusy(false); }
  }
  async function prepareReview(row: QueueRecord) {
    setFormError(null);
    try {
      const fresh = await api<ClientData>(`/api/ruta/cliente/${encodeURIComponent(id)}?dispatch_id=${encodeURIComponent(dispatch)}`);
      if (activeOwner.current === owner) setState({ owner, data: fresh, observed: null, error: null });
      if (fresh.dispatch_status === "CLOSED") throw new Error("El recorrido está cerrado. Esta operación tardía requiere conciliación administrativa.");
      if (activeOwner.current === owner) setReview({ owner, row, fresh });
    } catch (error) { setFormError(`${errorText(error)} El cobro y los productos originales siguen conservados. Comparte la referencia de operación con el administrador.`); }
  }
  async function confirmReview() {
    if (!review || !uid || saveLock.current) return;
    saveLock.current = true; setSaving(true); setFormError(null);
    try {
      await routeQueue.reconfirm(uid, dispatch, review.row.key, { revision: review.fresh.client.revision, balance: review.fresh.client.current_balance, prices: Object.fromEntries(review.fresh.inventory.map((product) => [product.id, product.credit_price])) });
      setReview(null); await syncRoute(uid, dispatch); await queue.refresh(); await load();
      window.dispatchEvent(new Event("semancontrol-queue"));
      setMessage("Confirmación conservada. Consulta su estado; no vuelvas a cobrar ni entregar estos productos.");
    } catch (error) { setFormError(errorText(error)); } finally { saveLock.current = false; setSaving(false); }
  }
  async function reportIncident(row: QueueRecord) {
    if (!uid || saveLock.current) return;
    saveLock.current = true; setSaving(true); setFormError(null);
    try {
      const result = await reportRouteIncident(uid, dispatch, row.key);
      await queue.refresh(); window.dispatchEvent(new Event("semancontrol-queue"));
      setMessage(result.state === "registered" ? "El servidor confirmó que esta visita ya estaba registrada antes del cierre." : "Incidencia enviada al administrador. El cobro, la entrega y la foto originales permanecen conservados para revisión.");
    } catch (error) { setFormError(errorText(error)); } finally { saveLock.current = false; setSaving(false); }
  }
  return <AppShell role="WORKER" title={data ? `Tarjeta #${data.client.route_order}` : "Atención de tarjeta"} subtitle="Abono y productos en una sola visita.">
    <div style={{ marginBottom: 18 }}>{onBack ? <button type="button" className="sc-button sc-button-secondary" onClick={onBack}><ArrowLeft size={18} />Volver a mi ruta</button> : <Link className="sc-button sc-button-secondary" href={`/ruta?dispatch_id=${encodeURIComponent(dispatch)}`}><ArrowLeft size={18} />Volver a mi ruta</Link>}</div>
    {!dispatch && <Notice>Selecciona primero tu recorrido en Mi ruta.</Notice>}
    {((state.owner === owner && state.error) || (!session && sessionState.error)) && <Notice tone="error">{state.owner === owner ? state.error || sessionState.error : sessionState.error}</Notice>}
    {formError && <Notice tone="error">{formError}</Notice>}{message && <Notice tone={message.startsWith("Visita registrada") ? "success" : "info"}>{message}</Notice>}
    <QueueStatus rows={queue.rows} busy={queue.busy} online={queue.online} onSync={() => void queue.synchronize().then(load)} />
    {closed && <Notice>El recorrido está cerrado. Conservamos las visitas pendientes para revisarlas con el administrador; no recibas un nuevo cobro ni entregues más productos en este recorrido.</Notice>}
    {data && <><section className="sc-panel"><div className="sc-actions" style={{ justifyContent: "space-between" }}><div><h2 style={{ fontSize: 24 }}>{data.client.name}</h2><p>{data.client.address}</p><p className="sc-muted">{data.client.address_reference}</p></div><button type="button" className="sc-button sc-button-secondary" onClick={() => { setLinkEmail(data.client.linked_email ?? ""); setLinking(true); }} disabled={!queue.online}><Link2 size={18} />Vincular QR / Mail</button></div>{data.client.visited_by && <Notice>Ya atendida por {data.client.visited_by}. Una nueva visita queda registrada por separado.</Notice>}<div className="sc-stat" style={{ marginTop: 18, marginBottom: 0 }}><small>{data.client.current_balance < 0 ? "Saldo a favor anterior" : "Saldo anterior"}</small><strong><Money value={data.client.current_balance} /></strong></div>{state.observed && <p className="sc-muted" style={{ marginTop: 12 }}>Consultado {new Date(state.observed).toLocaleString("es-CO", { timeZone: "America/Bogota" })}. El servidor revisará saldo, precio y carga al sincronizar.</p>}</section>
    <form onSubmit={saveVisit} style={{ paddingBottom: 190 }}><fieldset disabled={locked} style={{ border: 0, padding: 0 }}><section className="sc-panel"><h2>1. Abono de hoy</h2><Field label="Abono en pesos"><input type="number" inputMode="numeric" min={0} step={1} value={draft.payment} onChange={(event) => update({ payment: event.target.value })} placeholder="0" /></Field><div className="sc-actions" style={{ marginBottom: 18 }}>{[["Pago total", Math.max(0, data.client.current_balance)], ["+$10.000", (Number.isFinite(payment) ? payment : 0) + 10000], ["+$20.000", (Number.isFinite(payment) ? payment : 0) + 20000]].map(([label, value]) => <button key={label} type="button" className="sc-button sc-button-secondary" onClick={() => update({ payment: String(value) })}>{label}</button>)}</div><div className="sc-actions" role="group" aria-label="Forma de abono"><button type="button" aria-pressed={draft.method === "CASH"} className={`sc-button ${draft.method === "CASH" ? "" : "sc-button-secondary"}`} onClick={() => update({ method: "CASH" })}>Efectivo</button><button type="button" aria-pressed={draft.method === "TRANSFER"} className={`sc-button ${draft.method === "TRANSFER" ? "" : "sc-button-secondary"}`} onClick={() => update({ method: "TRANSFER" })}>Transferencia</button></div>
    {draft.method === "TRANSFER" && <div style={{ marginTop: 20 }}><Notice>El abono será provisional hasta que el jefe confirme en banco. Una transferencia observada conserva ese descuento mientras se revisa.</Notice><label className="sc-actions" style={{ minHeight: 48, marginBottom: 12 }}><input type="checkbox" checked={draft.readable} onChange={(event) => update({ readable: event.target.checked })} />Mayor detalle para referencias pequeñas (hasta 1600 px / 500 KB)</label><Field label={photoBusy ? "Preparando foto…" : "Tomar o elegir foto del comprobante"}><span className="sc-actions"><Camera size={20} /><input type="file" accept="image/*" capture="environment" onChange={(event) => void choosePhoto(event.target.files?.[0])} /></span></Field>{preview && <><a href={preview} target="_blank" rel="noreferrer" aria-label="Ampliar comprobante"><img src={preview} alt="Vista previa del comprobante de transferencia" style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8 }} /></a><p className="sc-muted">WebP · {Math.ceil((draft.photo?.size ?? 0) / 1024)} KB · Toca la foto para ampliarla.</p>{draft.exceptional && <Notice>Este comprobante usa el perfil excepcional de mayor detalle. Comprueba los datos bancarios antes de guardarlo.</Notice>}<label className="sc-actions" style={{ minHeight: 48 }}><input type="checkbox" checked={draft.accepted} onChange={(event) => update({ accepted: event.target.checked })} />Se leen importe, fecha y referencia bancaria</label></>}</div>}
    </section><section className="sc-panel"><h2>2. Productos dejados hoy</h2>{!data.inventory.length && <p className="sc-muted">No hay productos cargados en este recorrido.</p>}{data.inventory.map((product) => {
      const localQty = queue.rows.filter((row) => row.state !== "registered" && !row.resolved_by).reduce((total, row) => total + row.payload.items.filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.qty, 0), 0);
      const available = Math.max(0, product.remaining_qty - localQty), qty = draft.quantities[product.id] ?? 0;
      return <div key={product.id} style={{ paddingBlock: 16, borderBottom: "1px solid #dce4e8" }}><div className="sc-actions" style={{ justifyContent: "space-between" }}><div><strong>{product.name}</strong><p><Money value={product.credit_price} /> por unidad</p><p className="sc-muted">Quedan {product.remaining_qty} en tu recorrido{localQty ? ` · ${localQty} en pendientes de este teléfono` : ""}</p></div><div className="sc-actions"><button type="button" className="sc-icon-button" aria-label={`Quitar una unidad de ${product.name}`} disabled={qty === 0} onClick={() => update({ quantities: { ...draft.quantities, [product.id]: qty - 1 } })}><Minus size={20} /></button><output aria-label={`Cantidad de ${product.name}`} style={{ minWidth: 30, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{qty}</output><button type="button" className="sc-icon-button" aria-label={`Añadir una unidad de ${product.name}`} disabled={qty >= available} onClick={() => update({ quantities: { ...draft.quantities, [product.id]: qty + 1 } })}><Plus size={20} /></button></div></div></div>;
    })}</section></fieldset>
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20, background: "white", borderTop: "2px solid #155f4b", padding: "12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom))", boxShadow: "0 -4px 20px #172b3a15" }}><div style={{ maxWidth: 1100, margin: "auto" }}><p className="sc-muted" style={{ fontSize: 12 }}>Saldo anterior − Abono + Productos hoy</p><p style={{ fontSize: 16, marginBlock: 4 }}><Money value={data.client.current_balance} /> − <Money value={valid ? payment : 0} /> + <Money value={charge} /> = <strong><Money value={valid ? balance : data.client.current_balance} /></strong></p>{valid && balance < 0 && <p className="sc-muted">El nuevo saldo queda a favor del cliente.</p>}<button type="submit" className="sc-button" style={{ width: "100%", marginTop: 8 }} disabled={locked || !valid}><Check size={20} />{saving ? "Conservando visita…" : blocking ? "Revisa la visita pendiente" : savedVisit ? "Visita conservada" : "Guardar visita"}</button></div></div></form>
    {savedVisit && !blocking && <button type="button" className="sc-button sc-button-secondary" onClick={() => { setSavedVisit(false); setMessage(null); }}>Iniciar otra visita</button>}
    {ownRows.length > 0 && <section style={{ marginBottom: 190 }}><h2 style={{ fontWeight: 800, marginBottom: 12 }}>Visitas conservadas</h2>{ownRows.map((row) => <div key={row.key}><PendingDetail row={row} />{row.state === "conflict" && !row.resolved_by && !row.reported_incident && (closed ? <button type="button" className="sc-button" disabled={!queue.online || saving} onClick={() => void reportIncident(row)}>Enviar al administrador</button> : <button type="button" className="sc-button sc-button-secondary" disabled={!queue.online || saving} onClick={() => void prepareReview(row)}>Revisar cambios para confirmar</button>)}</div>)}</section>}
    {review && <section className="sc-panel" style={{ marginBottom: 190 }}><h2>Confirma el cobro que ya recibiste</h2><Notice>No vuelvas a cobrar ni entregar productos. Conservamos la operación original y registraremos una nueva confirmación del mismo abono y cantidades.</Notice><p>Saldo observado: <Money value={review.row.payload.expected_balance} /> → saldo actual: <Money value={review.fresh.client.current_balance} /></p><p>Abono físico conservado: <Money value={review.row.payload.payment_amount} /></p>{review.row.payload.items.map((item) => { const product = review.fresh.inventory.find((candidate) => candidate.id === item.product_id); return <p key={item.product_id}>{product?.name ?? "Producto fuera de la carga"} · {item.qty} unidades · <Money value={item.unit_credit_price} /> → <Money value={product?.credit_price ?? item.unit_credit_price} />{product && product.remaining_qty < item.qty ? " · Carga insuficiente: consulta al administrador" : ""}</p>; })}<div className="sc-actions" style={{ marginTop: 16 }}><button type="button" className="sc-button" disabled={saving || review.row.payload.items.some((item) => !review.fresh.inventory.some((product) => product.id === item.product_id && product.remaining_qty >= item.qty))} onClick={() => void confirmReview()}>Confirmar mismo cobro y entrega</button><button type="button" className="sc-button sc-button-secondary" onClick={() => setReview(null)}>Conservar incidencia</button></div></section>}
    {data.history.length > 0 && <section className="sc-panel" style={{ marginBottom: 190 }}><h2>Últimas visitas de la tarjeta</h2>{data.history.slice(0, 5).map((movement) => <div key={movement.id} style={{ paddingBlock: 10, borderBottom: "1px solid #dce4e8" }}><p>{new Date(movement.created_at.endsWith("Z") ? movement.created_at : `${movement.created_at.replace(" ", "T")}Z`).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p><p>Abono <Money value={movement.payment_amount} /> · Productos <Money value={movement.charge_amount} /> · Saldo <Money value={movement.new_balance} /></p>{movement.payment_method === "TRANSFER" && <span className="sc-badge">{movement.transfer_status === "VERIFIED" ? "Confirmada en banco" : movement.transfer_status === "REJECTED" ? "Rechazada con reverso" : movement.transfer_status === "OBSERVED" ? "Observada; descuento provisional" : "Pendiente de banco"}</span>}</div>)}</section>}</>}
    <dialog ref={dialog} onCancel={() => setLinking(false)} aria-labelledby="link-title" style={{ width: "min(92vw,460px)", border: "1px solid #a9bbc6", borderRadius: 14, padding: 24 }}><div className="sc-actions" style={{ justifyContent: "space-between" }}><h2 id="link-title" style={{ fontWeight: 800 }}>Vincular tarjeta</h2><button type="button" className="sc-icon-button" aria-label="Cerrar vínculo" onClick={() => setLinking(false)}><X size={20} /></button></div><p className="sc-muted" style={{ marginBlock: 14 }}>El cliente escanea el QR e inicia sesión con su Google. Un vínculo existente lo corrige el administrador.</p>{linkError && <Notice tone="error">{linkError}</Notice>}<form onSubmit={makeLink}><Field label="Gmail del cliente (opcional)"><input type="email" value={linkEmail} onChange={(event) => setLinkEmail(event.target.value)} /></Field><button type="submit" className="sc-button" disabled={linkBusy || !queue.online}><QrCode size={20} />{linkBusy ? "Preparando…" : "Generar vínculo y QR"}</button></form>{link?.owner === owner && <div style={{ textAlign: "center", marginTop: 18 }}><img src={link.image} alt="QR para vincular esta tarjeta con Google" width={240} height={240} style={{ maxWidth: "100%", margin: "auto" }} /><p className="sc-muted">Válido hasta {new Date(link.expires_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}. Uso único.</p><a className="sc-button sc-button-secondary" href={link.url} target="_blank" rel="noreferrer">Abrir vínculo</a></div>}</dialog>
  </AppShell>;
}


