export interface ClosureDraft {
  dispatchId: string; expectedCash: number; receivedCash: string; reason: string; confirmed: boolean;
  workers: { sync_confirmed: boolean }[];
  inventory: { id: string; remaining_qty: number; initial_qty: number }[];
  received: Record<string, string>;
}
export function prepareClosure(draft: ClosureDraft): Record<string, unknown> {
  if (!draft.confirmed) throw new Error("Confirma que recibiste y contaste la mercancía devuelta.");
  if (!draft.workers.length || draft.workers.some((worker) => !worker.sync_confirmed)) throw new Error("Cada trabajador debe declarar sus pendientes sincronizados antes del cierre.");
  const cash = Number(draft.receivedCash);
  if (!draft.receivedCash.trim() || !Number.isSafeInteger(cash) || cash < 0) throw new Error("El efectivo recibido debe ser un importe entero no negativo.");
  const returns = draft.inventory.map((product) => {
    const raw = draft.received[product.id];
    const qty = Number(raw);
    if (raw === undefined || !raw.trim() || !Number.isSafeInteger(qty) || qty < 0 || qty > 1_000_000) throw new Error("Revisa la cantidad devuelta de cada producto.");
    return { product_id: product.id, received_qty: qty };
  });
  const discrepancy = cash !== draft.expectedCash || returns.some((item, index) => item.received_qty !== draft.inventory[index].remaining_qty);
  if (discrepancy && !draft.reason.trim()) throw new Error("Escribe un motivo para la diferencia de efectivo o mercancía.");
  return { dispatch_id: draft.dispatchId, received_cash: cash, returns, reason: draft.reason.trim(), returns_confirmed: true };
}
export class OperationDrafts {
  private readonly bodies = new Map<string, Record<string, unknown>>();
  private fingerprint(path: string, payload: Record<string, unknown>): string {
    const values = { ...payload };
    delete values.expected_revision;
    return `${path}:${JSON.stringify(values)}`;
  }
  prepare(path: string, payload: Record<string, unknown>): Record<string, unknown> {
    const fingerprint = this.fingerprint(path, payload);
    const existing = this.bodies.get(fingerprint);
    if (existing) return existing;
    const body = { ...structuredClone(payload), idempotency_key: crypto.randomUUID() };
    this.bodies.set(fingerprint, body);
    return body;
  }
  complete(path: string, payload: Record<string, unknown>): void { this.bodies.delete(this.fingerprint(path, payload)); }
}
import type { VisitInput } from "@/lib/contracts";
import { type OpeningDraftItem, prepareOpeningItems } from "./clientes/opening-model";


export function incidentReviewPrefill(id: string, visit: VisitInput): { client_id: string; delta: number; reason: string } {
  return {
    client_id: visit.client_id,
    delta: visit.items.reduce((total, item) => total + item.qty * item.unit_credit_price, 0) - visit.payment_amount,
    reason: `Compensación de la incidencia ${id}: operación pendiente recibida después del cierre.`,
  };
}
export function prepareIncidentResolution(id: string, visit: VisitInput, reason: string, adjustmentId: string): Record<string, unknown> {
  if (!reason.trim()) throw new Error("Describe cómo verificaste la incidencia y las cantidades físicas.");
  if (incidentReviewPrefill(id, visit).delta !== 0 && !adjustmentId.trim()) throw new Error("Vincula el ID del ajuste compensatorio registrado en esta tarjeta.");
  return { id, reason: reason.trim(), adjustment_id: adjustmentId.trim() || null };
}

export interface ClientEditorValues {
  id: string; name: string; address: string; address_reference: string; route_order: string;
  linked_email: string; is_active: boolean; reason?: string; opening_balance: string; opening_items?: OpeningDraftItem[];
}
export function prepareClientSave(form: ClientEditorValues): Record<string, unknown> {
  if (form.id && form.opening_items?.length) throw new Error("Los productos de la deuda inicial solo se registran al crear la tarjeta.");
  const opening = prepareOpeningItems(form.opening_items ?? []);
  let openingPayload: Record<string, unknown> = {};
  if (!form.id) {
    const openingBalance = Number(form.opening_balance);
    if (opening.items.length) {
      if (openingBalance !== 0) throw new Error("El saldo manual debe ser cero al registrar productos de la deuda inicial.");
      openingPayload = { opening_items: opening.items };
    } else {
      if (!form.opening_balance.trim() || !Number.isSafeInteger(openingBalance) || Math.abs(openingBalance) > 1_000_000_000) {
        throw new Error("El saldo de apertura debe ser un importe entero entre -1000000000 y 1000000000 pesos.");
      }
      openingPayload = { opening_balance: openingBalance };
    }
  }
  return {
    ...(form.id ? { id: form.id, route_order: Number(form.route_order) } : openingPayload),
    name: form.name.trim(), address: form.address.trim(), address_reference: form.address_reference.trim(),
    linked_email: form.linked_email.trim().toLowerCase() || null, is_active: form.is_active ? 1 : 0,
  };
}
