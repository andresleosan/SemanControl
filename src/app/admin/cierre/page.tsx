"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Check, ClipboardCheck, RefreshCw, SearchCheck, X } from "lucide-react";
import { AppShell, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { errorMessage, localDate, MutationNotice, Receipt, ResourceNotice, RoleBoundary, transferLabels, useMutation, useResource } from "../_components";
import { prepareClosure } from "../_form-model";
import type { ClosureData, Movement } from "../_types";
import { LateIncidents } from "./_incidents";

export default function ClosurePage() {
  return <RoleBoundary role="ADMIN"><ClosureScreen /></RoleBoundary>;
}

function ClosureScreen() {
  const [dispatchId, setDispatchId] = useState("");
  const resource = useResource<ClosureData>(`/api/admin/cierre${dispatchId ? `?dispatch_id=${encodeURIComponent(dispatchId)}` : ""}`);
  const data = resource.data;
  const selected = dispatchId ? data?.selected : null;
  return <AppShell role="ADMIN" title="Cierre y conciliación" subtitle="Recibe el efectivo y la mercancía; revisa cada transferencia en el banco.">
    <section className="sc-panel"><div className="sc-actions" style={{ alignItems: "end" }}><div style={{ flex: "1 1 260px" }}><Field label="Recorrido a revisar"><select value={dispatchId} onChange={(event) => setDispatchId(event.target.value)}><option value="">Selecciona un recorrido</option>{(data?.dispatches ?? []).map((dispatch) => <option value={dispatch.id} key={dispatch.id}>{dispatch.dispatch_date} · {dispatch.name} · {dispatch.status === "OPEN" ? "Abierto" : "Cerrado"}</option>)}</select></Field></div><button type="button" className="sc-button sc-button-secondary" disabled={resource.loading} onClick={resource.refresh} style={{ marginBottom: 14 }}><RefreshCw size={18} aria-hidden /> Actualizar</button></div></section>
    <ResourceNotice {...resource} />
    {!dispatchId && !resource.loading && !resource.error && <Notice>{data?.dispatches.length ? "Elige un recorrido para ver los cobros de cada trabajador y su carga compartida." : "Todavía no hay recorridos. Prepara uno desde Bodega."}</Notice>}
    {data && selected && <>
      <div className="sc-grid"><div className="sc-stat"><small>Efectivo esperado</small><strong><Money value={data.cash_total} /></strong><small>Suma de cobros en efectivo</small></div><div className="sc-stat"><small>Transferencias registradas</small><strong><Money value={data.transfer_total} /></strong><small>{data.transfers.length} comprobantes · incluye pagos en revisión</small></div><div className="sc-stat"><small>Mercancía esperada de vuelta</small><strong>{data.inventory.reduce((sum, product) => sum + product.remaining_qty, 0)} unidades</strong><small>Carga compartida de todo el recorrido</small></div></div>
      <section className="sc-panel"><h2>Entrega de cuentas por trabajador</h2><div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Trabajador</th><th>Efectivo</th><th>Transferencias</th><th>Pendientes del teléfono</th></tr></thead><tbody>{data.workers.map((worker) => <tr key={worker.id}><td><strong>{worker.name}</strong></td><td><Money value={worker.cash_total} /></td><td><Money value={worker.transfer_total} /><br /><small>{worker.transfer_count} transferencias</small></td><td><span className="sc-badge">{worker.sync_confirmed ? "Sincronización declarada" : "Declaración pendiente"}</span></td></tr>)}</tbody></table></div><p className="sc-muted" style={{ marginTop: 14 }}>Cada trabajador confirma desde Mi cuadre que sincronizó sus pendientes. Actualiza esta pantalla después de su declaración.</p></section>
      {selected.status === "OPEN" ? <PhysicalClosure key={selected.id} data={data} loading={resource.loading} refresh={resource.refresh} /> : <ClosedSummary data={data} />}
      {selected.status === "CLOSED" && <LateIncidents key={selected.id} dispatchId={selected.id} inventory={data.inventory} />}
      <section aria-labelledby="bank-review"><h2 id="bank-review" style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Comprobantes y revisión bancaria</h2><p className="sc-muted" style={{ marginBottom: 18 }}>Pendiente y En revisión ya descontaron el abono provisionalmente. Confirmar no vuelve a descontarlo. Rechazar devuelve el importe al saldo mediante un reverso único. Puedes conciliar después de cerrar.</p>
        {data.transfers.length ? <div className="sc-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))" }}>{data.transfers.map((movement) => <BankReview key={movement.id} movement={movement} loading={resource.loading} refresh={resource.refresh} />)}</div> : <Notice>Este recorrido no tiene transferencias registradas.</Notice>}
      </section>
    </>}
  </AppShell>;
}

function ClosedSummary({ data }: { data: ClosureData }) {
  return <section className="sc-panel"><h2><ClipboardCheck size={22} aria-hidden style={{ display: "inline", marginRight: 8 }} /> Recorrido cerrado</h2><Notice tone="success">La devolución quedó registrada. Las reservas se liberaron y las visitas nuevas están bloqueadas.</Notice>{data.closure && <><div className="sc-grid"><div><small>Efectivo esperado</small><p><Money value={data.closure.expected_cash ?? data.cash_total} /></p></div><div><small>Efectivo recibido</small><p><Money value={data.closure.received_cash ?? 0} /></p></div><div><small>Diferencia de efectivo</small><p><Money value={(data.closure.received_cash ?? 0) - (data.closure.expected_cash ?? data.cash_total)} /></p></div></div>{data.closure.created_at && <p className="sc-muted" style={{ marginTop: 12 }}>Cerrado {localDate(data.closure.created_at, true)}</p>}{data.closure.reason && <p><strong>Motivo del cierre:</strong> {data.closure.reason}</p>}</>}<h3 style={{ marginTop: 18 }}>Mercancía al cerrar</h3><div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Producto</th><th>Carga inicial</th><th>Esperado</th><th>Recibido</th><th>Diferencia</th></tr></thead><tbody>{data.inventory.map((item) => {
    const returned = data.closure?.returns?.find((entry) => entry.product_id === item.id);
    return <tr key={item.id}><td>{item.name}</td><td>{item.initial_qty}</td><td>{returned?.expected_qty ?? item.remaining_qty}</td><td>{returned?.received_qty ?? "Sin dato de recepción"}</td><td>{returned ? returned.received_qty - returned.expected_qty : "Sin dato"}</td></tr>;
  })}</tbody></table></div></section>;
}

function PhysicalClosure({ data, loading, refresh }: { data: ClosureData; loading: boolean; refresh: () => void }) {
  const [receivedCash, setReceivedCash] = useState("");
  const [received, setReceived] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false); const [reason, setReason] = useState("");
  const [validation, setValidation] = useState(""); const mutation = useMutation();
  const allSynced = data.workers.length > 0 && data.workers.every((worker) => worker.sync_confirmed);
  const cashDifference = receivedCash.trim() ? Number(receivedCash) - data.cash_total : null;
  const quantitiesComplete = data.inventory.every((item) => received[item.id]?.trim());
  const hasDifference = cashDifference !== null && cashDifference !== 0 || data.inventory.some((item) => received[item.id]?.trim() && Number(received[item.id]) !== item.remaining_qty);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation("");
    try {
      const payload = prepareClosure({ dispatchId: data.selected!.id, expectedCash: data.cash_total, receivedCash, received, reason, confirmed, workers: data.workers, inventory: data.inventory });
      const result = await mutation.run("/api/admin/cierre", payload, "Recorrido cerrado y devolución registrada.", true);
      if (result) refresh();
    } catch (error) { setValidation(errorMessage(error)); }
  }
  return <section className="sc-panel"><h2>Contar y recibir la devolución</h2><MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}{!allSynced && <Notice>Falta la declaración de sincronización de uno o más trabajadores. El cierre estará disponible cuando todos la confirmen.</Notice>}<form onSubmit={submit}><fieldset disabled={mutation.busy || loading}>
    <div className="sc-grid"><Field label="Efectivo recibido físicamente (COP)"><input type="number" inputMode="numeric" required min="0" step="1" value={receivedCash} onChange={(event) => setReceivedCash(event.target.value)} /></Field><div className="sc-stat"><small>Recibido − esperado</small><strong>{cashDifference === null ? "Pendiente de contar" : <Money value={cashDifference} />}</strong><small>{cashDifference === null ? "" : cashDifference < 0 ? "Falta efectivo" : cashDifference > 0 ? "Hay efectivo adicional" : "El efectivo coincide"}</small></div></div>
    <div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Producto</th><th>Carga inicial</th><th>Devolución esperada</th><th>Recibido físicamente</th><th>Diferencia</th></tr></thead><tbody>{data.inventory.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.initial_qty}</td><td>{item.remaining_qty}</td><td><input aria-label={`Cantidad devuelta de ${item.name}`} type="number" required min="0" max={1000000} step="1" inputMode="numeric" value={received[item.id] ?? ""} onChange={(event) => setReceived({ ...received, [item.id]: event.target.value })} style={{ minWidth: 120, maxWidth: 160 }} /></td><td>{received[item.id]?.trim() ? Number(received[item.id]) - item.remaining_qty : "Por contar"}</td></tr>)}</tbody></table></div>
    <Field label={hasDifference ? "Motivo de las diferencias (obligatorio)" : "Nota del cierre (opcional)"}><textarea required={Boolean(hasDifference)} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} style={{ marginTop: 14 }} /></Field>
    <label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo que recibí y conté el efectivo y los productos indicados.</label>
    <p className="sc-muted" style={{ marginBottom: 16 }}>El cierre conserva las diferencias y libera la carga reservada. Los sobrantes ya estaban incluidos en el total del negocio.</p><SubmitButton disabled={mutation.busy || !allSynced || !confirmed || !receivedCash.trim() || !quantitiesComplete}><Banknote size={18} aria-hidden />{mutation.busy ? "Cerrando…" : "Confirmar devolución y cerrar recorrido"}</SubmitButton>
  </fieldset></form></section>;
}

function BankReview({ movement, loading, refresh }: { movement: Movement & { client_name: string; worker_name: string }; loading: boolean; refresh: () => void }) {
  const [reason, setReason] = useState(""); const [validation, setValidation] = useState(""); const mutation = useMutation();
  async function review(status: "VERIFIED" | "OBSERVED" | "REJECTED") {
    setValidation("");
    if (status !== "VERIFIED" && !reason.trim()) { setValidation("Escribe un motivo para observar o rechazar esta transferencia."); return; }
    const result = await mutation.run("/api/admin/transferencias", { movement_id: movement.id, status, reason: reason.trim() || "Pago confirmado en banco." }, status === "VERIFIED" ? "Transferencia confirmada en banco." : status === "OBSERVED" ? "Transferencia observada; conserva el descuento provisional." : "Transferencia rechazada y reverso registrado.", true);
    if (result) { setReason(""); refresh(); }
  }
  return <article className="sc-panel"><span className="sc-badge">{transferLabels[movement.transfer_status]}</span><h3 style={{ marginTop: 12 }}>{movement.client_name}</h3><p style={{ fontSize: 24, fontWeight: 800 }}><Money value={movement.payment_amount} /></p><p className="sc-muted" style={{ marginBlock: 12 }}>{localDate(movement.created_at, true)}<br />Registrada por {movement.worker_name}</p>{movement.receipt_id ? <Receipt id={movement.receipt_id} gallery /> : <Notice tone="error">No se encontró un comprobante asociado. Revisa esta incidencia antes de confirmar.</Notice>}<MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}
    {movement.transfer_status === "REJECTED" ? <Notice>El reverso de esta transferencia ya está registrado.</Notice> : <fieldset disabled={mutation.busy || loading}><Field label="Motivo de la revisión"><textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><div className="sc-actions"><button type="button" className="sc-button" disabled={movement.transfer_status === "VERIFIED" || !movement.receipt_id} onClick={() => void review("VERIFIED")}><Check size={18} aria-hidden />{mutation.busy ? "Guardando…" : "Confirmar en banco"}</button><button type="button" className="sc-button sc-button-secondary" onClick={() => void review("OBSERVED")}><SearchCheck size={18} aria-hidden /> Observar</button><button type="button" className="sc-button sc-button-danger" onClick={() => void review("REJECTED")}><X size={18} aria-hidden /> Rechazar definitivamente</button></div></fieldset>}
  </article>;
}
