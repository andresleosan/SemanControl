"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Check, ClipboardCheck, RefreshCw, SearchCheck, X } from "lucide-react";
import { AppShell, Badge, Field, Money, Notice, SubmitButton } from "@/components/ui";
import { errorMessage, localDate, MutationNotice, Receipt, ResourceNotice, RoleBoundary, transferLabels, transferTone, useMutation, useResource } from "../_components";
import { prepareClosure } from "../_form-model";
import type { ClosureData, Movement } from "../_types";
import { LateIncidents } from "./_incidents";

const transferFilters = [
  ["ALL", "Todas"], ["PENDING", "Pendientes"], ["OBSERVED", "En revisión"], ["VERIFIED", "Confirmadas"], ["REJECTED", "Rechazadas"],
] as const;

export default function ClosurePage() {
  return <RoleBoundary role="ADMIN"><ClosureScreen /></RoleBoundary>;
}

function ClosureScreen() {
  const [dispatchId, setDispatchId] = useState("");
  const [transferStatus, setTransferStatus] = useState<(typeof transferFilters)[number][0]>("ALL");
  const [transferSearch, setTransferSearch] = useState("");
  const resource = useResource<ClosureData>(`/api/admin/cierre${dispatchId ? `?dispatch_id=${encodeURIComponent(dispatchId)}` : ""}`);
  const data = resource.data;
  const selected = dispatchId ? data?.selected : null;
  const term = transferSearch.trim().toLocaleLowerCase("es-CO");
  const transfers = data?.transfers ?? [];
  const filteredTransfers = transfers.filter((movement) => (transferStatus === "ALL" || movement.transfer_status === transferStatus) && (!term || [movement.client_name, movement.worker_name].some((name) => name.toLocaleLowerCase("es-CO").includes(term))));
  return <AppShell role="ADMIN" title="Cierre y conciliación" subtitle="Recibe el efectivo y la mercancía; revisa cada transferencia en el banco.">
    <section className="sc-panel"><div className="sc-filter-bar"><div style={{ flex: "1 1 260px" }}><Field label="Recorrido a revisar"><select value={dispatchId} onChange={(event) => setDispatchId(event.target.value)}><option value="">Selecciona un recorrido</option>{(data?.dispatches ?? []).map((dispatch) => <option value={dispatch.id} key={dispatch.id}>{dispatch.dispatch_date} · {dispatch.name} · {dispatch.status === "OPEN" ? "Abierto" : "Cerrado"}</option>)}</select></Field></div><button type="button" className="sc-button sc-button-secondary" disabled={resource.loading} onClick={resource.refresh}><RefreshCw size={18} aria-hidden /> Actualizar</button></div></section>
    <ResourceNotice {...resource} />
    {!dispatchId && !resource.loading && !resource.error && <Notice>{data?.dispatches.length ? "Elige un recorrido para ver los cobros de cada trabajador y su carga compartida." : "Todavía no hay recorridos. Prepara uno desde Bodega."}</Notice>}
    {data && selected && <>
      <div className="sc-grid sc-stats-grid"><div className="sc-stat"><small>Efectivo esperado</small><strong><Money value={data.cash_total} /></strong><small>Suma de cobros en efectivo</small></div><div className="sc-stat"><small>Transferencias registradas</small><strong><Money value={data.transfer_total} /></strong><small>{data.transfers.length} comprobantes · incluye pagos en revisión</small></div><div className="sc-stat"><small>Mercancía esperada de vuelta</small><strong>{data.inventory.reduce((sum, product) => sum + product.remaining_qty, 0)} unidades</strong><small>Carga compartida de todo el recorrido</small></div></div>
      <section className="sc-panel"><div className="sc-section-header"><h2>Entrega de cuentas por trabajador</h2><Badge tone={data.workers.length > 0 && data.workers.every((worker) => worker.sync_confirmed) ? "success" : "warning"}>{data.workers.filter((worker) => worker.sync_confirmed).length} de {data.workers.length} trabajadores listos</Badge></div><div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Trabajador</th><th scope="col">Efectivo</th><th scope="col">Transferencias</th><th scope="col">Pendientes del teléfono</th></tr></thead><tbody>{data.workers.map((worker) => <tr key={worker.id}><td data-label="Trabajador"><strong>{worker.name}</strong></td><td data-label="Efectivo"><Money value={worker.cash_total} /></td><td data-label="Transferencias"><div><Money value={worker.transfer_total} /><br /><small>{worker.transfer_count} transferencias</small></div></td><td data-label="Pendientes del teléfono"><Badge tone={worker.sync_confirmed ? "success" : "warning"}>{worker.sync_confirmed ? "Sincronización declarada" : "Declaración pendiente"}</Badge></td></tr>)}</tbody></table></div><p className="sc-muted" style={{ marginTop: 14 }}>Cada trabajador confirma desde Mi cuadre que sincronizó sus pendientes. Actualiza esta pantalla después de su declaración.</p></section>
      {selected.status === "OPEN" ? <PhysicalClosure key={selected.id} data={data} loading={resource.loading} refresh={resource.refresh} /> : <ClosedSummary data={data} />}
      {selected.status === "CLOSED" && <LateIncidents key={selected.id} dispatchId={selected.id} inventory={data.inventory} />}
      <section aria-labelledby="bank-review"><div className="sc-section-header"><h2 id="bank-review" style={{ fontSize: 22, fontWeight: 800 }}>Comprobantes y revisión bancaria</h2><Badge tone={transfers.some((movement) => ["PENDING", "OBSERVED"].includes(movement.transfer_status)) ? "warning" : "neutral"}>{transfers.filter((movement) => ["PENDING", "OBSERVED"].includes(movement.transfer_status)).length} por revisar</Badge></div><p className="sc-muted" style={{ marginBottom: 18 }}>Pendiente y En revisión ya descontaron el abono provisionalmente. Confirmar no vuelve a descontarlo. Rechazar devuelve el importe al saldo mediante un reverso único. Puedes conciliar después de cerrar.</p>
        {data.transfers.length ? <>
          <div className="sc-panel"><div className="sc-segmented" role="group" aria-label="Filtrar transferencias por estado">{transferFilters.map(([status, label]) => <button key={status} type="button" className="sc-button" aria-pressed={transferStatus === status} onClick={() => setTransferStatus(status)}>{label} <span>{status === "ALL" ? transfers.length : transfers.filter((movement) => movement.transfer_status === status).length}</span></button>)}</div><div className="sc-filter-bar" style={{ marginTop: 16 }}><Field label="Buscar transferencias por cliente o trabajador"><input type="search" value={transferSearch} onChange={(event) => setTransferSearch(event.target.value)} /></Field><p className="sc-muted" role="status">{filteredTransfers.length} de {transfers.length} comprobantes</p></div></div>
          {filteredTransfers.length ? <div className="sc-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))" }}>{filteredTransfers.map((movement) => <BankReview key={movement.id} movement={movement} loading={resource.loading} refresh={resource.refresh} />)}</div> : <Notice>No hay transferencias que coincidan con los filtros.</Notice>}
        </> : <Notice>Este recorrido no tiene transferencias registradas.</Notice>}
      </section>
    </>}
  </AppShell>;
}

function ClosedSummary({ data }: { data: ClosureData }) {
  return <section className="sc-panel"><div className="sc-section-header"><h2><ClipboardCheck size={22} aria-hidden style={{ display: "inline", marginRight: 8 }} /> Recorrido cerrado</h2><Badge tone="neutral">Cerrado</Badge></div><Notice tone="success">La devolución quedó registrada. Las reservas se liberaron y las visitas nuevas están bloqueadas.</Notice>{data.closure && <><div className="sc-grid"><div><small>Efectivo esperado</small><p><Money value={data.closure.expected_cash ?? data.cash_total} /></p></div><div><small>Efectivo recibido</small><p><Money value={data.closure.received_cash ?? 0} /></p></div><div><small>Diferencia de efectivo</small><p><Money value={(data.closure.received_cash ?? 0) - (data.closure.expected_cash ?? data.cash_total)} /></p></div></div>{data.closure.created_at && <p className="sc-muted" style={{ marginTop: 12 }}>Cerrado {localDate(data.closure.created_at, true)}</p>}{data.closure.reason && <p><strong>Motivo del cierre:</strong> {data.closure.reason}</p>}</>}<h3 style={{ marginTop: 18 }}>Mercancía al cerrar</h3><div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Producto</th><th scope="col">Carga inicial</th><th scope="col">Esperado</th><th scope="col">Recibido</th><th scope="col">Diferencia</th></tr></thead><tbody>{data.inventory.map((item) => {
    const returned = data.closure?.returns?.find((entry) => entry.product_id === item.id);
    const difference = returned ? returned.received_qty - returned.expected_qty : null;
    return <tr key={item.id}><td data-label="Producto"><strong>{item.name}</strong></td><td data-label="Carga inicial">{item.initial_qty}</td><td data-label="Esperado">{returned?.expected_qty ?? item.remaining_qty}</td><td data-label="Recibido">{returned?.received_qty ?? "Sin dato de recepción"}</td><td data-label="Diferencia"><Badge tone={difference === null ? "neutral" : difference === 0 ? "success" : "warning"}>{difference === null ? "Sin dato" : difference === 0 ? "Coincide" : difference < 0 ? `Faltan ${Math.abs(difference)}` : `Sobran ${difference}`}</Badge></td></tr>;
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
  return <section className="sc-panel"><div className="sc-section-header"><h2>Contar y recibir la devolución</h2><Badge tone={quantitiesComplete ? "success" : "warning"}>{data.inventory.filter((item) => received[item.id]?.trim()).length} de {data.inventory.length} productos contados</Badge></div><MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}{!allSynced && <Notice>Falta la declaración de sincronización de uno o más trabajadores. El cierre estará disponible cuando todos la confirmen.</Notice>}<form onSubmit={submit}><fieldset disabled={mutation.busy || loading}>
    <div className="sc-grid"><Field label="Efectivo recibido físicamente (COP)"><input type="number" inputMode="numeric" required min="0" step="1" value={receivedCash} onChange={(event) => setReceivedCash(event.target.value)} /></Field><div className="sc-stat"><small>Recibido − esperado</small><strong>{cashDifference === null ? "Pendiente de contar" : <Money value={cashDifference} />}</strong><small>{cashDifference === null ? "" : cashDifference < 0 ? "Falta efectivo" : cashDifference > 0 ? "Hay efectivo adicional" : "El efectivo coincide"}</small></div></div>
    <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Producto</th><th scope="col">Carga inicial</th><th scope="col">Devolución esperada</th><th scope="col">Recibido físicamente</th><th scope="col">Diferencia</th></tr></thead><tbody>{data.inventory.map((item) => {
      const difference = received[item.id]?.trim() ? Number(received[item.id]) - item.remaining_qty : null;
      return <tr key={item.id}><td data-label="Producto"><strong>{item.name}</strong></td><td data-label="Carga inicial">{item.initial_qty}</td><td data-label="Devolución esperada">{item.remaining_qty}</td><td data-label="Recibido físicamente"><input aria-label={`Cantidad devuelta de ${item.name}`} type="number" required min="0" max={1000000} step="1" inputMode="numeric" value={received[item.id] ?? ""} onChange={(event) => setReceived({ ...received, [item.id]: event.target.value })} style={{ minWidth: 120, maxWidth: 160 }} /></td><td data-label="Diferencia"><Badge tone={difference === null ? "neutral" : difference === 0 ? "success" : "warning"}>{difference === null ? "Por contar" : difference === 0 ? "Coincide" : difference < 0 ? `Faltan ${Math.abs(difference)}` : `Sobran ${difference}`}</Badge></td></tr>;
    })}</tbody></table></div>
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
  return <article className="sc-panel"><Badge tone={transferTone(movement.transfer_status)}>{transferLabels[movement.transfer_status]}</Badge><div className="sc-section-header" style={{ marginTop: 12 }}><h3>{movement.client_name}</h3><p style={{ fontSize: 24, fontWeight: 800 }}><Money value={movement.payment_amount} /></p></div><p className="sc-muted" style={{ marginBlock: 12 }}>{localDate(movement.created_at, true)}<br />Registrada por {movement.worker_name}</p>{movement.receipt_id ? <Receipt id={movement.receipt_id} gallery /> : <Notice tone="error">No se encontró un comprobante asociado. Revisa esta incidencia antes de confirmar.</Notice>}<MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}
    {movement.transfer_status === "REJECTED" ? <Notice>El reverso de esta transferencia ya está registrado.</Notice> : <fieldset disabled={mutation.busy || loading}><Field label="Motivo de la revisión"><textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><p className="sc-muted" style={{ marginBottom: 14 }}>Observar conserva el descuento provisional. Rechazar definitivamente agrega <Money value={movement.payment_amount} /> de nuevo al saldo de {movement.client_name} mediante un reverso registrado.</p><div className="sc-actions"><button type="button" className="sc-button" disabled={movement.transfer_status === "VERIFIED" || !movement.receipt_id} onClick={() => void review("VERIFIED")}><Check size={18} aria-hidden />{mutation.busy ? "Guardando…" : "Confirmar en banco"}</button><button type="button" className="sc-button sc-button-secondary" onClick={() => void review("OBSERVED")}><SearchCheck size={18} aria-hidden /> Observar</button><button type="button" className="sc-button sc-button-danger" onClick={() => void review("REJECTED")}><X size={18} aria-hidden /> Rechazar definitivamente</button></div></fieldset>}
  </article>;
}
