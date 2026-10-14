"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Check, ClipboardList, ExternalLink, RefreshCw } from "lucide-react";
import { Field, Money, Notice, SubmitButton } from "@/components/ui";
import type { VisitInput } from "@/lib/contracts";
import { errorMessage, localDate, MutationNotice, Receipt, ResourceNotice, useMutation, useResource } from "../_components";
import { incidentReviewPrefill, prepareIncidentResolution } from "../_form-model";
import type { RouteProduct } from "../_types";

interface Incident {
  id: string; client_id: string; dispatch_id: string; client_name: string; worker_name: string;
  payload: VisitInput; status: "OPEN" | "RESOLVED"; created_at: string;
  receipt_available: boolean; resolution_note: string | null;
}

export function LateIncidents({ dispatchId, inventory }: { dispatchId: string; inventory: RouteProduct[] }) {
  const resource = useResource<{ incidents: Incident[] }>(`/api/admin/incidencias?dispatch_id=${encodeURIComponent(dispatchId)}`);
  const incidents = resource.data?.incidents ?? [];
  return <section aria-labelledby="late-incidents" style={{ marginBottom: 24 }}><div className="sc-actions" style={{ justifyContent: "space-between", marginBottom: 12 }}><h2 id="late-incidents" style={{ fontSize: 22, fontWeight: 800 }}><ClipboardList size={22} aria-hidden style={{ display: "inline", marginRight: 8 }} /> Operaciones pendientes recibidas después del cierre</h2><button type="button" className="sc-button sc-button-secondary" disabled={resource.loading} onClick={resource.refresh}><RefreshCw size={18} aria-hidden /> Actualizar incidencias</button></div>
    <Notice>Estas operaciones requieren revisión administrativa. El recorrido sigue cerrado. Resolver una incidencia vincula un ajuste ya registrado; no vuelve a cambiar el saldo ni el inventario.</Notice><ResourceNotice {...resource} />
    {!resource.loading && !resource.error && !incidents.length && <Notice>No hay incidencias tardías para este recorrido.</Notice>}
    {incidents.map((incident) => <IncidentReview key={incident.id} incident={incident} inventory={inventory} loading={resource.loading} refresh={resource.refresh} />)}
  </section>;
}

function IncidentReview({ incident, inventory, loading, refresh }: { incident: Incident; inventory: RouteProduct[]; loading: boolean; refresh: () => void }) {
  const [reason, setReason] = useState(""); const [adjustmentId, setAdjustmentId] = useState("");
  const [validation, setValidation] = useState(""); const mutation = useMutation();
  const visit = incident.payload; const prefill = incidentReviewPrefill(incident.id, visit);
  const charge = visit.items.reduce((total, item) => total + item.qty * item.unit_credit_price, 0);
  const query = new URLSearchParams({ client_id: incident.client_id });
  if (prefill.delta !== 0) { query.set("adjustment_delta", String(prefill.delta)); query.set("adjustment_reason", prefill.reason); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation("");
    try {
      const payload = prepareIncidentResolution(incident.id, visit, reason, adjustmentId);
      const result = await mutation.run("/api/admin/incidencias", payload, "Incidencia revisada y resolución registrada.");
      if (result) refresh();
    } catch (error) { setValidation(errorMessage(error)); }
  }
  return <article className="sc-panel"><span className="sc-badge">{incident.status === "OPEN" ? "Pendiente de revisión" : "Revisada"}</span><h3 style={{ marginTop: 12 }}>{incident.client_name}</h3><p className="sc-muted">Informada por {incident.worker_name} · {localDate(incident.created_at, true)}</p><div className="sc-grid" style={{ marginTop: 16 }}><div className="sc-stat"><small>Abono físico informado</small><strong><Money value={visit.payment_amount} /></strong><small>{visit.payment_method === "CASH" ? "Efectivo" : visit.payment_method === "TRANSFER" ? "Transferencia" : "Sin abono"}</small></div><div className="sc-stat"><small>Productos informados</small><strong><Money value={charge} /></strong></div><div className="sc-stat"><small>Cambio neto del saldo a compensar</small><strong><Money value={prefill.delta} /></strong><small>Productos menos abono</small></div></div>
    <p style={{ marginBottom: 14 }}>Saldo que tenía la operación: <Money value={visit.expected_balance} /> − <Money value={visit.payment_amount} /> + <Money value={charge} /> = <strong><Money value={visit.expected_balance + prefill.delta} /></strong>. Este resultado corresponde al borrador original; no es una confirmación del saldo actual.</p>
    {visit.items.length > 0 && <div className="sc-table-wrap"><table className="sc-table"><thead><tr><th>Producto informado</th><th>Cantidad</th><th>Precio fiado original</th><th>Subtotal</th></tr></thead><tbody>{visit.items.map((item) => <tr key={item.product_id}><td>{inventory.find((product) => product.id === item.product_id)?.name ?? `Producto ${item.product_id}`}</td><td>{item.qty}</td><td><Money value={item.unit_credit_price} /></td><td><Money value={item.qty * item.unit_credit_price} /></td></tr>)}</tbody></table></div>}
    {incident.receipt_available && <Receipt id={incident.id} path={`/api/ruta/incidencias/${encodeURIComponent(incident.id)}/comprobante`} gallery />}
    {visit.payment_method === "TRANSFER" && <Notice>Revisa el comprobante y el banco antes de resolver. Registra la verificación bancaria en el motivo de revisión.</Notice>}
    {incident.status === "RESOLVED" ? <Notice tone="success"><strong>Resolución:</strong> {incident.resolution_note ?? "Revisión administrativa registrada."}</Notice> : <>
      <Notice>Revisa el conteo físico del cierre y las compras o ajustes posteriores. La merma o el sobrante podrían estar registrados en la diferencia del cierre. Corrige existencias desde Bodega únicamente si hace falta y explica la decisión en el motivo para evitar descontar stock dos veces.</Notice>
      {prefill.delta === 0 ? <Notice>El abono y los productos no cambian el saldo neto. No crees un ajuste de cero: resuelve con una nota después de verificar efectivo, banco y mercancía.</Notice> : <p className="sc-muted" style={{ marginBottom: 16 }}>Registra o verifica un ajuste de <Money value={prefill.delta} /> en esta misma tarjeta y copia su ID desde el historial. El servidor comprueba tarjeta, tipo e importe.</p>}
      <Link className="sc-button sc-button-secondary" style={{ marginBottom: 16 }} href={`/admin/clientes?${query}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden /> {prefill.delta === 0 ? "Revisar historial de la tarjeta" : "Preparar ajuste y obtener su ID"}</Link>
      <MutationNotice {...mutation} />{validation && <Notice tone="error">{validation}</Notice>}<form onSubmit={submit}><fieldset disabled={mutation.busy || loading}>
        {prefill.delta !== 0 && <Field label="ID del ajuste compensatorio"><input required maxLength={100} value={adjustmentId} onChange={(event) => setAdjustmentId(event.target.value)} /></Field>}
        <Field label="Motivo y resultado de la revisión administrativa"><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><SubmitButton disabled={mutation.busy || !reason.trim() || (prefill.delta !== 0 && !adjustmentId.trim())}><Check size={18} aria-hidden />{mutation.busy ? "Registrando revisión…" : "Registrar resolución de la incidencia"}</SubmitButton>
      </fieldset></form>
    </>}
  </article>;
}
