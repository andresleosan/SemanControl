import { describe, expect, it } from "vitest";
import { incidentReviewPrefill, OperationDrafts, prepareClientSave, prepareClosure, prepareIncidentResolution } from "../src/app/admin/_form-model";
import type { VisitInput } from "../src/lib/contracts";
import { errorFallbackData, readableData } from "../src/app/admin/_resource-model";

const fixture = {
  dispatchId: "route-1", expectedCash: 50000, receivedCash: "50000", reason: "", confirmed: true,
  workers: [{ sync_confirmed: true }],
  inventory: [{ id: "product-1", remaining_qty: 3, initial_qty: 5 }],
  received: { "product-1": "3" },
};

describe("physical closure confirmation", () => {
  it("blocks a physical discrepancy without a reason", () => {
    expect(() => prepareClosure({ ...fixture, received: { "product-1": "2" } })).toThrow(/motivo/i);
  });
  it("sends received quantities without adding them to total stock", () => {
    expect(prepareClosure({ ...fixture, reason: "Faltó una unidad", received: { "product-1": "2" } })).toEqual({
      dispatch_id: "route-1", received_cash: 50000,
      returns: [{ product_id: "product-1", received_qty: 2 }],
      reason: "Faltó una unidad", returns_confirmed: true,
    });
  });
  it("blocks closure until every worker has declared synchronization", () => {
    expect(() => prepareClosure({ ...fixture, workers: [{ sync_confirmed: true }, { sync_confirmed: false }] })).toThrow(/sincron/i);
  });
  it("requires a whole nonnegative physical return quantity", () => {
    expect(() => prepareClosure({ ...fixture, received: { "product-1": "1.5" } })).toThrow(/cantidad/i);
    expect(() => prepareClosure({ ...fixture, received: { "product-1": "-1" }, reason: "error" })).toThrow(/cantidad/i);
  });
  it("allows additional physical stock when an unexpected excess has a reason", () => {
    expect(prepareClosure({ ...fixture, received: { "product-1": "6" }, reason: "Trajeron tres unidades adicionales" }).returns).toEqual([{ product_id: "product-1", received_qty: 6 }]);
  });
});

describe("administrative retries", () => {
  it("retains the same operation key until a successful response", () => {
    const drafts = new OperationDrafts();
    const first = drafts.prepare("/api/admin/compras", { qty: 4, reason: "Compra viernes" });
    const retry = drafts.prepare("/api/admin/compras", { qty: 4, reason: "Compra viernes" });
    expect(retry.idempotency_key).toBe(first.idempotency_key);
    drafts.complete("/api/admin/compras", { qty: 4, reason: "Compra viernes" });
    expect(drafts.prepare("/api/admin/compras", { qty: 4, reason: "Compra viernes" }).idempotency_key).not.toBe(first.idempotency_key);
  });
  it("does not reuse a key for changed form contents", () => {
    const drafts = new OperationDrafts();
    const first = drafts.prepare("/api/admin/ajustes", { delta: 100 });
    expect(drafts.prepare("/api/admin/ajustes", { delta: 200 }).idempotency_key).not.toBe(first.idempotency_key);
  });
  it("keeps the original balance revision after an uncertain response and a refresh", () => {
    const drafts = new OperationDrafts();
    const first = drafts.prepare("/api/admin/ajustes", { client_id: "client-1", expected_revision: 3, delta: 100, reason: "Saldo físico" });
    const retry = drafts.prepare("/api/admin/ajustes", { client_id: "client-1", expected_revision: 4, delta: 100, reason: "Saldo físico" });
    expect(retry).toEqual(first);
    expect(retry.expected_revision).toBe(3);
  });
});

const incidentVisit: VisitInput = {
  idempotency_key: "3a0ca149-d6f5-4dc7-a31e-7fa70e19b1ae", dispatch_id: "route-1", client_id: "client-1",
  expected_revision: 3, expected_balance: 50000, payment_amount: 20000, payment_method: "CASH",
  items: [{ product_id: "product-1", qty: 2, unit_credit_price: 15000 }],
};

describe("late operation review", () => {
  it("prefills the correct client and net adjustment without counting the payment as a charge", () => {
    expect(incidentReviewPrefill("incident-1", incidentVisit)).toEqual({
      client_id: "client-1", delta: 10000, reason: "Compensación de la incidencia incident-1: operación pendiente recibida después del cierre.",
    });
  });
  it("requires a compensation reference before resolving a financial incident", () => {
    expect(() => prepareIncidentResolution("incident-1", incidentVisit, "Se comprobó el efectivo", "")).toThrow(/ajuste/i);
  });
  it("allows a visit with no payment or products to be resolved with a review note", () => {
    expect(prepareIncidentResolution("incident-1", { ...incidentVisit, payment_amount: 0, payment_method: "NONE", items: [] }, "Se verificó la atención", "")).toEqual({ id: "incident-1", reason: "Se verificó la atención", adjustment_id: null });
  });
  it("does not require a zero-value adjustment when payment exactly offsets the products", () => {
    expect(prepareIncidentResolution("incident-1", { ...incidentVisit, payment_amount: 30000 }, "Productos y efectivo comprobados; saldo sin cambio", "")).toEqual({ id: "incident-1", reason: "Productos y efectivo comprobados; saldo sin cambio", adjustment_id: null });
  });
});

describe("private resource visibility", () => {
  const record = { owner: "admin-a", path: "/api/admin/inventario", epoch: 1, data: { cost_price: 15000 }, error: "" };
  it("hides the previous actor's costs when the account changes", () => {
    expect(readableData(record, "worker-b", record.path, true)).toBeNull();
    expect(readableData(record, "", record.path, false)).toBeNull();
  });
  it("drops previously loaded financial data after access is denied", () => {
    expect(errorFallbackData(403, record, "admin-a", record.path)).toBeNull();
    expect(errorFallbackData(401, record, "admin-a", record.path)).toBeNull();
  });
});

import { prepareOpeningItems } from "../src/app/admin/clientes/opening-model";

const clientEditor = {
  id: "", name: "María", address: "Calle 10", address_reference: "Reja negra", route_order: "",
  linked_email: "", is_active: true, reason: "Tarjeta física original", opening_balance: "65000",
};
describe("original client opening balance", () => {
  const previousDelivery = { product_id: "yogurt-fresa", qty: "2", unit_credit_price: "12000" };

  it("calculates the previous product deliveries with the entered historical price", () => {
    expect(prepareOpeningItems([previousDelivery])).toEqual({
      items: [{ product_id: "yogurt-fresa", qty: 2, unit_credit_price: 12000 }], total: 24000,
    });
    expect(prepareOpeningItems([{ ...previousDelivery, unit_credit_price: "9000" }])).toEqual({
      items: [{ product_id: "yogurt-fresa", qty: 2, unit_credit_price: 9000 }], total: 18000,
    });
    expect(prepareOpeningItems([])).toEqual({ items: [], total: 0 });
  });

  it("sends previous deliveries as product lines without counting their value twice", () => {
    const body = prepareClientSave({
      ...clientEditor, opening_balance: "0", opening_items: [previousDelivery],
    });
    expect(body).toMatchObject({ opening_items: [{ product_id: "yogurt-fresa", qty: 2, unit_credit_price: 12000 }] });
    expect(body).not.toHaveProperty("opening_balance");
    expect(body).not.toHaveProperty("reason");
  });

  it("rejects a manual balance together with previous product deliveries", () => {
    expect(() => prepareClientSave({ ...clientEditor, opening_items: [previousDelivery] })).toThrow(/saldo/i);
    expect(() => prepareClientSave({ ...clientEditor, opening_balance: "-12000", opening_items: [previousDelivery] })).toThrow(/saldo/i);
  });

  it("sends the physical card balance directly in a new client request", () => {
    expect(prepareClientSave(clientEditor)).toMatchObject({ opening_balance: 65000 });
    expect(prepareClientSave({ ...clientEditor, opening_balance: "-12000" })).toMatchObject({ opening_balance: -12000 });
    expect(prepareClientSave({ ...clientEditor, opening_balance: "0", opening_items: [] })).toMatchObject({ opening_balance: 0 });
    expect(prepareClientSave({ ...clientEditor, opening_balance: "1000000000" })).toMatchObject({ opening_balance: 1000000000 });
    expect(prepareClientSave({ ...clientEditor, opening_balance: "-1000000000" })).toMatchObject({ opening_balance: -1000000000 });
  });

  it.each(["", "1.5", "NaN", "Infinity", "1000000001", "-1000000001", "9007199254740992"])("rejects the invalid manual balance %s", (opening_balance) => {
    expect(() => prepareClientSave({ ...clientEditor, opening_balance })).toThrow(/saldo/i);
  });

  it("normalizes the card details and sends no reason even when an older draft contains one", () => {
    expect(prepareClientSave({
      ...clientEditor, name: " María ", address: " Calle 10 ", address_reference: " Reja negra ",
      linked_email: " MARIA@EXAMPLE.COM ",
    })).toEqual({
      name: "María", address: "Calle 10", address_reference: "Reja negra", linked_email: "maria@example.com",
      is_active: 1, opening_balance: 65000,
    });
    const withoutReason = { ...clientEditor, reason: undefined };
    expect(prepareClientSave(withoutReason)).not.toHaveProperty("reason");
  });

  it("normalizes product identifiers and rejects duplicate or missing products", () => {
    expect(prepareOpeningItems([{ ...previousDelivery, product_id: " yogurt-fresa " }]).items[0].product_id).toBe("yogurt-fresa");
    expect(() => prepareOpeningItems([previousDelivery, { ...previousDelivery, product_id: " yogurt-fresa " }])).toThrow(/repetid|duplicad/i);
    expect(() => prepareOpeningItems([{ ...previousDelivery, product_id: " " }])).toThrow(/producto/i);
  });

  it.each(["", "0", "-1", "1.5", "NaN", "Infinity", "100001", "9007199254740992"])("rejects the invalid opening quantity %s", (qty) => {
    expect(() => prepareOpeningItems([{ ...previousDelivery, qty }])).toThrow(/cantidad/i);
  });

  it.each(["", "-1", "1.5", "NaN", "Infinity", "1000000001", "9007199254740992"])("rejects the invalid historical price %s", (unit_credit_price) => {
    expect(() => prepareOpeningItems([{ ...previousDelivery, unit_credit_price }])).toThrow(/precio/i);
  });

  it("accepts free historical products and the maximum quantity without overflowing the debt", () => {
    expect(prepareOpeningItems([{ ...previousDelivery, qty: "100000", unit_credit_price: "0" }])).toEqual({
      items: [{ product_id: "yogurt-fresa", qty: 100000, unit_credit_price: 0 }], total: 0,
    });
    expect(prepareOpeningItems([{ ...previousDelivery, qty: "1", unit_credit_price: "1000000000" }]).total).toBe(1000000000);
    expect(() => prepareOpeningItems([{ ...previousDelivery, unit_credit_price: "500000001" }])).toThrow(/total|deuda/i);
    expect(() => prepareOpeningItems([
      { ...previousDelivery, qty: "1", unit_credit_price: "1000000000" },
      { product_id: "yogurt-mora", qty: "1", unit_credit_price: "1" },
    ])).toThrow(/total|deuda/i);
  });

  it("limits a previous-delivery request to fifty distinct product lines", () => {
    const lines = Array.from({ length: 50 }, (_, index) => ({ product_id: `product-${index}`, qty: "1", unit_credit_price: "0" }));
    expect(prepareOpeningItems(lines).items).toHaveLength(50);
    expect(() => prepareOpeningItems([...lines, { product_id: "extra", qty: "1", unit_credit_price: "0" }])).toThrow(/50|productos|líneas/i);
  });

  it("does not send an opening balance when editing an existing card", () => {
    const body = prepareClientSave({ ...clientEditor, id: "client-1", route_order: "7" });
    expect(body).toMatchObject({ id: "client-1", route_order: 7 });
    expect(body).not.toHaveProperty("opening_balance");
    expect(body).not.toHaveProperty("opening_items");
    expect(body).not.toHaveProperty("reason");
  });

  it("rejects previous-delivery changes when editing an existing card", () => {
    expect(() => prepareClientSave({ ...clientEditor, id: "client-1", opening_items: [previousDelivery] })).toThrow(/apertura|inicial/i);
  });
  it("preserves the complete new-card request on retry, including the opening balance", () => {
    const drafts = new OperationDrafts();
    const body = prepareClientSave(clientEditor);
    const first = drafts.prepare("/api/admin/clientes", body);
    expect(drafts.prepare("/api/admin/clientes", body)).toEqual(first);
    expect(first.opening_balance).toBe(65000);
  });

  it("preserves the normalized product request and operation key after an uncertain response", () => {
    const drafts = new OperationDrafts();
    const first = drafts.prepare("/api/admin/clientes", prepareClientSave({
      ...clientEditor, opening_balance: "0", opening_items: [previousDelivery],
    }));
    const retry = drafts.prepare("/api/admin/clientes", prepareClientSave({
      ...clientEditor, opening_balance: "0", opening_items: [{ ...previousDelivery, qty: " 2 ", unit_credit_price: "12000 " }],
    }));
    expect(retry).toEqual(first);
    expect(first.opening_items).toEqual([{ product_id: "yogurt-fresa", qty: 2, unit_credit_price: 12000 }]);
    expect(first).not.toHaveProperty("opening_balance");
  });
});
