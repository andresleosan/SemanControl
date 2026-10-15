import "server-only";
import type { Movement, MovementItem, RouteProduct } from "../contracts";

// These projections are public: never SELECT costs, UIDs, hashes or R2 keys.
const MOVEMENT_COLUMNS = "m.id, m.client_id, m.dispatch_id, m.worker_user_id, m.movement_type, m.previous_balance, m.payment_amount, m.payment_method, m.transfer_status, m.charge_amount, m.adjustment_amount, m.new_balance, m.reason, m.created_at, COALESCE(m.client_sequence, 0) AS client_sequence, r.id AS receipt_id";
const ITEM_COLUMNS = "product_id, product_name_snapshot, qty, unit_credit_price, subtotal";

async function withItems(db: D1Database, rows: Omit<Movement, "items">[]): Promise<Movement[]> {
  if (!rows.length) return [];
  // Chunked to stay below the D1 bind parameter limit for long-lived cards.
  const grouped = new Map<string, MovementItem[]>();
  for (let start = 0; start < rows.length; start += 50) {
    const ids = rows.slice(start, start + 50).map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.prepare(`SELECT movement_id, ${ITEM_COLUMNS} FROM movement_items WHERE movement_id IN (${placeholders}) UNION ALL SELECT movement_id, ${ITEM_COLUMNS} FROM opening_items WHERE movement_id IN (${placeholders}) ORDER BY movement_id,product_id`).bind(...ids, ...ids).all<MovementItem & { movement_id: string }>();
    for (const row of result.results) {
      const { movement_id, ...item } = row;
      grouped.set(movement_id, [...(grouped.get(movement_id) ?? []), item]);
    }
  }
  return rows.map((row) => ({ ...row, items: grouped.get(row.id) ?? [] }));
}
export async function publicHistory(db: D1Database, clientId: string): Promise<Movement[]> {
  const { results } = await db.prepare(`SELECT ${MOVEMENT_COLUMNS} FROM ledger_movements m LEFT JOIN receipts r ON r.movement_id = m.id WHERE m.client_id = ? ORDER BY m.created_at DESC, m.client_sequence DESC, m.id DESC`).bind(clientId).all<Omit<Movement, "items">>();
  return withItems(db, results);
}
export async function publicMovement(db: D1Database, movementId: string): Promise<Movement> {
  const row = await db.prepare(`SELECT ${MOVEMENT_COLUMNS} FROM ledger_movements m LEFT JOIN receipts r ON r.movement_id = m.id WHERE m.id = ?`).bind(movementId).first<Omit<Movement, "items">>();
  if (!row) throw new Error("Confirmed movement is unavailable");
  return (await withItems(db, [row]))[0];
}
export async function routeInventory(db: D1Database, dispatchId: string): Promise<RouteProduct[]> {
  const { results } = await db.prepare("SELECT p.id, CASE WHEN c.id IS NULL THEN p.name ELSE c.name || ' · ' || p.name END name, p.credit_price, i.remaining_qty, i.initial_qty FROM dispatch_inventory i JOIN products p ON p.id = i.product_id LEFT JOIN product_categories c ON c.id = p.category_id WHERE i.dispatch_id = ? ORDER BY name, p.id")
    .bind(dispatchId).all<RouteProduct>();
  return results;
}
