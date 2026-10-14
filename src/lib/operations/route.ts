import "server-only";
import type { Principal } from "../auth/types";
import type { ClientCard, Movement, RouteProduct } from "../contracts";
import { ApiError } from "../security/errors";
import { assertAssignment, assertWorker, CLIENT_COLUMNS, clearGuards, guard, identifier } from "./core";
import { publicHistory, routeInventory } from "./read-model";

interface RouteDispatch { id: string; name: string; dispatch_date: string; status: "OPEN" | "CLOSED" }
const ACTIVE_ASSIGNMENT = "EXISTS (SELECT 1 FROM users u JOIN dispatch_workers w ON w.worker_user_id = u.id JOIN route_dispatches d ON d.id = w.dispatch_id WHERE u.id = ? AND u.role = 'WORKER' AND u.is_active = 1 AND d.status = 'OPEN')";
const VISIT_COLUMNS = ", (SELECT u.name FROM ledger_movements m JOIN users u ON u.id = m.worker_user_id WHERE m.client_id = c.id AND m.dispatch_id = ? AND m.movement_type = 'VISIT' ORDER BY m.client_sequence DESC, m.created_at DESC, m.id DESC LIMIT 1) AS visited_by, (SELECT COUNT(*) FROM ledger_movements m WHERE m.client_id = c.id AND m.dispatch_id = ? AND m.movement_type = 'VISIT') AS visits_count";

export async function readRoute(db: D1Database, principal: Principal, requested?: string | null): Promise<{ dispatches: RouteDispatch[]; clients: ClientCard[]; inventory: RouteProduct[] }> {
  await assertWorker(db, principal);
  const dispatches = (await db.prepare("SELECT d.id, d.name, d.dispatch_date, d.status FROM route_dispatches d JOIN dispatch_workers w ON w.dispatch_id = d.id WHERE w.worker_user_id = ? AND (d.status = 'OPEN' OR d.id = ?) ORDER BY d.dispatch_date DESC, d.name, d.id")
    .bind(principal.userId, requested ?? null).all<RouteDispatch>()).results;
  const dispatchId = requested ? identifier(requested, "el recorrido") : dispatches.length === 1 ? dispatches[0].id : null;
  if (!dispatchId) return { dispatches, clients: [], inventory: [] };
  await assertAssignment(db, principal, dispatchId);
  const clients = (await db.prepare(`SELECT ${CLIENT_COLUMNS}${VISIT_COLUMNS} FROM clients c WHERE c.is_active = 1 ORDER BY c.route_order, c.id`).bind(dispatchId, dispatchId).all<ClientCard>()).results;
  return { dispatches, clients, inventory: await routeInventory(db, dispatchId) };
}
export async function readRouteClient(db: D1Database, principal: Principal, clientId: string, dispatchId: string): Promise<{ client: ClientCard; dispatch_status: "OPEN" | "CLOSED"; inventory: RouteProduct[]; history: Movement[] }> {
  dispatchId = identifier(dispatchId, "el recorrido");
  clientId = identifier(clientId, "la tarjeta");
  await assertAssignment(db, principal, dispatchId);
  const client = await db.prepare(`SELECT ${CLIENT_COLUMNS}${VISIT_COLUMNS} FROM clients c WHERE c.id = ? AND c.is_active = 1`).bind(dispatchId, dispatchId, clientId).first<ClientCard>();
  if (!client) throw new ApiError(404, "CLIENT_NOT_FOUND", "La tarjeta no está activa.");
  const dispatch = await db.prepare("SELECT status FROM route_dispatches WHERE id = ?").bind(dispatchId).first<{ status: "OPEN" | "CLOSED" }>();
  if (!dispatch) throw new ApiError(404, "DISPATCH_NOT_FOUND", "No se encontró el recorrido.");
  return { client, dispatch_status: dispatch.status, inventory: await routeInventory(db, dispatchId), history: await publicHistory(db, clientId) };
}
function field(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ApiError(400, "INVALID_FIELD", `Revisa ${label}.`);
  return value.trim();
}
export async function createRouteClient(db: D1Database, principal: Principal, body: Record<string, unknown>): Promise<{ client: ClientCard }> {
  await assertWorker(db, principal);
  if (Object.keys(body).some((key) => !["name", "address", "address_reference", "linked_email"].includes(key))) throw new ApiError(400, "INVALID_FIELD", "La tarjeta contiene campos no admitidos.");
  const name = field(body.name, "el nombre", 140);
  const address = field(body.address, "la dirección", 240);
  const reference = field(body.address_reference, "la referencia", 240);
  const email = body.linked_email === null || body.linked_email === undefined || body.linked_email === "" ? null : field(body.linked_email, "el correo Google", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "INVALID_EMAIL", "Revisa el correo Google.");
  if (email && await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) throw new ApiError(409, "CLIENT_EMAIL_RESERVED", "Este correo pertenece a un administrador o trabajador. Usa el correo Google del cliente.");
  const id = crypto.randomUUID();
  const guardId = crypto.randomUUID();
  try {
    await db.batch([
      guard(db, guardId, `${ACTIVE_ASSIGNMENT} AND NOT EXISTS(SELECT 1 FROM users WHERE email=?)`, [principal.userId, email]),
      db.prepare("INSERT INTO clients(id, name, address, address_reference, route_order, linked_email) SELECT ?, ?, ?, ?, COALESCE(MAX(route_order), 0) + 1, ? FROM clients").bind(id, name, address, reference, email),
      db.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason, next_json) SELECT ?, ?, 'CLIENT_CREATED', id, 'Nueva tarjeta registrada en ruta', json_object('name',name,'address',address,'address_reference',address_reference,'route_order',route_order,'linked_email',linked_email) FROM clients WHERE id = ?").bind(crypto.randomUUID(), principal.userId, id),
      clearGuards(db, [guardId]),
    ]);
  } catch (error) {
    if (/CHECK constraint/i.test(String(error))) throw new ApiError(403, "DISPATCH_FORBIDDEN", "Necesitas un recorrido abierto asignado para registrar tarjetas.");
    if (/UNIQUE constraint/i.test(String(error))) throw new ApiError(409, "CLIENT_CONFLICT", "El correo ya está vinculado a otra tarjeta.");
    throw error;
  }
  const client = await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients c WHERE c.id = ?`).bind(id).first<ClientCard>();
  if (!client) throw new Error("Created client is unavailable");
  return { client };
}
export async function readRouteSummary(db: D1Database, principal: Principal, dispatchId: string): Promise<{ dispatch: RouteDispatch; cash_total: number; transfer_total: number; transfer_count: number; inventory: RouteProduct[]; sync_confirmed: boolean }> {
  dispatchId = identifier(dispatchId, "el recorrido");
  await assertAssignment(db, principal, dispatchId);
  const dispatch = await db.prepare("SELECT id, name, status, dispatch_date FROM route_dispatches WHERE id = ?").bind(dispatchId).first<RouteDispatch>();
  if (!dispatch) throw new ApiError(404, "DISPATCH_NOT_FOUND", "No se encontró el recorrido.");
  const totals = await db.prepare("SELECT COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN payment_amount ELSE 0 END), 0) AS cash_total, COALESCE(SUM(CASE WHEN payment_method = 'TRANSFER' THEN payment_amount ELSE 0 END), 0) AS transfer_total, COALESCE(SUM(CASE WHEN payment_method = 'TRANSFER' THEN 1 ELSE 0 END), 0) AS transfer_count FROM ledger_movements WHERE dispatch_id = ? AND worker_user_id = ? AND movement_type = 'VISIT'").bind(dispatchId, principal.userId).first<{ cash_total: number; transfer_total: number; transfer_count: number }>();
  const sync = await db.prepare("SELECT pending_sync_confirmed_at FROM dispatch_workers WHERE dispatch_id = ? AND worker_user_id = ?").bind(dispatchId, principal.userId).first<{ pending_sync_confirmed_at: string | null }>();
  return { dispatch, cash_total: totals?.cash_total ?? 0, transfer_total: totals?.transfer_total ?? 0, transfer_count: totals?.transfer_count ?? 0, inventory: await routeInventory(db, dispatchId), sync_confirmed: !!sync?.pending_sync_confirmed_at };
}
export async function confirmSynchronized(db: D1Database, principal: Principal, dispatchId: string): Promise<{ ok: true }> {
  dispatchId = identifier(dispatchId, "el recorrido");
  await assertAssignment(db, principal, dispatchId, true);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    await db.batch([
      guard(db, ids[0], "EXISTS (SELECT 1 FROM users u JOIN dispatch_workers w ON w.worker_user_id = u.id JOIN route_dispatches d ON d.id = w.dispatch_id WHERE u.id = ? AND u.role = 'WORKER' AND u.is_active = 1 AND d.id = ? AND d.status = 'OPEN')", [principal.userId, dispatchId]),
      db.prepare("UPDATE dispatch_workers SET pending_sync_confirmed_at = datetime('now') WHERE dispatch_id = ? AND worker_user_id = ?").bind(dispatchId, principal.userId),
      guard(db, ids[1], "changes() = 1"),
      db.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason) VALUES (?, ?, 'WORKER_SYNC_CONFIRMED', ?, 'El trabajador declara haber sincronizado sus pendientes locales')").bind(crypto.randomUUID(), principal.userId, dispatchId),
      clearGuards(db, ids),
    ]);
  } catch (error) {
    if (/constraint|DISPATCH_/i.test(String(error))) throw new ApiError(409, "DISPATCH_CONFLICT", "El recorrido cambió; revisa su estado antes de entregar cuentas.");
    throw error;
  }
  return { ok: true };
}
