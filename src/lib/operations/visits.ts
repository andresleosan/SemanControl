import "server-only";
import type { Principal } from "../auth/types";
import type { Movement, VisitInput } from "../contracts";
import { ApiError } from "../security/errors";
import { assertAssignment, assertWorker, canonicalJson, clearGuards, conflict, digest, guard, identifier, uuid, whole } from "./core";
import { publicMovement } from "./read-model";

export function parseVisit(body: Record<string, unknown>): VisitInput {
  const allowed = new Set(["idempotency_key", "dispatch_id", "client_id", "expected_revision", "expected_balance", "payment_amount", "payment_method", "receipt_id", "items"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new ApiError(400, "INVALID_FIELD", "La visita contiene campos no admitidos.");
  const method = body.payment_method;
  if (method !== "NONE" && method !== "CASH" && method !== "TRANSFER") throw new ApiError(400, "INVALID_PAYMENT", "Selecciona el medio del abono.");
  const payment = whole(body.payment_amount, "el abono");
  const receipt = body.receipt_id === null || body.receipt_id === undefined ? null : uuid(body.receipt_id);
  if ((payment === 0 && method !== "NONE") || (payment > 0 && method === "NONE") || (method === "TRANSFER" ? !receipt : !!receipt)) throw new ApiError(400, "INVALID_PAYMENT", "Revisa el medio y el comprobante del abono.");
  if (!Array.isArray(body.items) || body.items.length > 50) throw new ApiError(400, "INVALID_ITEMS", "Revisa los productos de la visita.");
  const seen = new Set<string>();
  const items = body.items.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "INVALID_ITEMS", "Revisa los productos de la visita.");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !["product_id", "qty", "unit_credit_price"].includes(key))) throw new ApiError(400, "INVALID_ITEMS", "Revisa los productos de la visita.");
    const product = identifier(item.product_id, "el producto");
    if (seen.has(product)) throw new ApiError(400, "DUPLICATE_PRODUCT", "Cada producto debe aparecer una sola vez.");
    seen.add(product);
    const qty = whole(item.qty, "la cantidad", 1, 100_000);
    const price = whole(item.unit_credit_price, "el precio", 0, 1_000_000_000);
    whole(qty * price, "el cargo");
    return { product_id: product, qty, unit_credit_price: price };
  });
  return { idempotency_key: uuid(body.idempotency_key), dispatch_id: identifier(body.dispatch_id, "el recorrido"), client_id: identifier(body.client_id, "la tarjeta"), expected_revision: whole(body.expected_revision, "la revisión"), expected_balance: whole(body.expected_balance, "el saldo", -1_000_000_000_000), payment_amount: payment, payment_method: method, receipt_id: receipt, items };
}
export async function registerVisit(db: D1Database, principal: Principal, body: Record<string, unknown>): Promise<{ movement: Movement; replayed: boolean }> {
  const input = parseVisit(body);
  await assertWorker(db, principal);
  const hash = await digest(canonicalJson(body));
  async function replay() {
    const existing = await db.prepare("SELECT id, worker_user_id, request_hash FROM ledger_movements WHERE idempotency_key = ?").bind(input.idempotency_key).first<{ id: string; worker_user_id: string; request_hash: string | null }>();
    if (!existing) return null;
    if (existing.worker_user_id !== principal.userId || existing.request_hash !== hash) conflict();
    return { movement: await publicMovement(db, existing.id), replayed: true };
  }
  const existing = await replay();
  if (existing) return existing;
  await assertAssignment(db, principal, input.dispatch_id, true);
  const charge = whole(input.items.reduce((sum, item) => sum + item.qty * item.unit_credit_price, 0), "el cargo");
  const nextBalance = whole(input.expected_balance - input.payment_amount + charge, "el saldo final", -1_000_000_000_000);
  const movementId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  const guards: string[] = [];
  const check = (condition: string, values: (string | number | null)[] = []) => {
    const id = `${movementId}:${guards.length}`; guards.push(id); statements.push(guard(db, id, condition, values));
  };
  check("EXISTS (SELECT 1 FROM users u JOIN dispatch_workers w ON w.worker_user_id = u.id JOIN route_dispatches d ON d.id = w.dispatch_id WHERE u.id = ? AND u.role = 'WORKER' AND u.is_active = 1 AND d.id = ? AND d.status = 'OPEN') AND NOT EXISTS (SELECT 1 FROM operation_requests WHERE idempotency_key = ?)", [principal.userId, input.dispatch_id, input.idempotency_key]);
  statements.push(db.prepare("UPDATE clients SET current_balance = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND current_balance = ? AND is_active = 1").bind(nextBalance, input.client_id, input.expected_revision, input.expected_balance));
  check("changes() = 1");
  for (const item of input.items) {
    statements.push(db.prepare("UPDATE dispatch_inventory SET remaining_qty = remaining_qty - ? WHERE dispatch_id = ? AND product_id = ? AND remaining_qty >= ? AND EXISTS (SELECT 1 FROM products WHERE id = ? AND is_active = 1 AND credit_price = ?)").bind(item.qty, input.dispatch_id, item.product_id, item.qty, item.product_id, item.unit_credit_price));
    check("changes() = 1");
    statements.push(db.prepare("UPDATE products SET total_stock = total_stock - ? WHERE id = ? AND total_stock >= ? AND is_active = 1 AND credit_price = ?").bind(item.qty, item.product_id, item.qty, item.unit_credit_price));
    check("changes() = 1");
  }
  if (input.receipt_id) check("EXISTS (SELECT 1 FROM receipts WHERE id = ? AND owner_user_id = ? AND client_id = ? AND dispatch_id = ? AND movement_id IS NULL) AND NOT EXISTS (SELECT 1 FROM operation_guards WHERE id = ?)", [input.receipt_id, principal.userId, input.client_id, input.dispatch_id, `receipt-cleanup:${input.receipt_id}`]);
  statements.push(db.prepare("INSERT INTO ledger_movements(id, idempotency_key, client_id, dispatch_id, worker_user_id, previous_balance, payment_amount, payment_method, receipt_r2_key, transfer_status, charge_amount, new_balance, client_sequence, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT r2_key FROM receipts WHERE id = ?), ?, ?, ?, ?, ?)")
    .bind(movementId, input.idempotency_key, input.client_id, input.dispatch_id, principal.userId, input.expected_balance, input.payment_amount, input.payment_method, input.receipt_id ?? null, input.payment_method === "TRANSFER" ? "PENDING" : "NOT_APPLICABLE", charge, nextBalance, input.expected_revision + 1, hash));
  for (const item of input.items) {
    // Cost is copied inside D1. It is never fetched into this public service.
    statements.push(db.prepare("INSERT INTO movement_items(id, movement_id, product_id, product_name_snapshot, qty, unit_credit_price, subtotal, unit_cost_price) SELECT ?, ?, id, name, ?, credit_price, ? * credit_price, cost_price FROM products WHERE id = ? AND is_active = 1 AND credit_price = ?")
      .bind(crypto.randomUUID(), movementId, item.qty, item.qty, item.product_id, item.unit_credit_price));
    check("changes() = 1");
  }
  if (input.receipt_id) {
    statements.push(db.prepare("UPDATE receipts SET movement_id = ? WHERE id = ? AND movement_id IS NULL").bind(movementId, input.receipt_id));
    check("changes() = 1");
  }
  statements.push(db.prepare("UPDATE dispatch_workers SET pending_sync_confirmed_at = NULL WHERE dispatch_id = ? AND worker_user_id = ?").bind(input.dispatch_id, principal.userId));
  check("changes() = 1");
  statements.push(db.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason, previous_json, next_json) VALUES (?, ?, 'CLIENT_VISITED', ?, 'Atención de tarjeta en recorrido', ?, ?)").bind(crypto.randomUUID(), principal.userId, input.client_id, JSON.stringify({ balance: input.expected_balance, revision: input.expected_revision }), JSON.stringify({ movement_id: movementId, balance: nextBalance, revision: input.expected_revision + 1 })));
  statements.push(clearGuards(db, guards));
  try {
    await db.batch(statements);
  } catch (error) {
    // A simultaneous retry may have committed while this batch rolled back.
    const committed = await replay();
    if (committed) return committed;
    if (/CHECK constraint|UNIQUE constraint|LEDGER_DUPLICATE|STOCK_|DISPATCH_|VISIT_|ITEM_|RECEIPT_|FOREIGN KEY/i.test(String(error))) conflict();
    throw error;
  }
  return { movement: await publicMovement(db, movementId), replayed: false };
}
