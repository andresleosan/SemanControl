import "server-only";
import type { Principal } from "../auth/types";
import { ApiError } from "../security/errors";

export const CLIENT_COLUMNS = "c.id, c.name, c.address, c.address_reference, c.route_order, c.linked_email, c.current_balance, c.is_active, c.revision";
export const UUID_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new ApiError(400, "INVALID_FIELD", `Revisa ${label}.`);
  return value.trim();
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "INVALID_UUID", "La clave de la operación no es válida.");
  return value.toLowerCase();
}
export function whole(value: unknown, label: string, min = 0, max = 1_000_000_000_000): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new ApiError(400, "INVALID_FIELD", `Revisa ${label}.`);
  return value;
}
export function conflict(): never {
  throw new ApiError(409, "OPERATION_CONFLICT", "La tarjeta, el precio o los sobrantes cambiaron. Conserva el pendiente y revisa los datos antes de resolverlo.");
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
export async function digest(value: string | ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value);
  return Array.from(new Uint8Array(hash), (part) => part.toString(16).padStart(2, "0")).join("");
}
export function guard(db: D1Database, id: string, condition: string, values: (string | number | null)[] = []): D1PreparedStatement {
  return db.prepare(`INSERT INTO operation_guards(id, ok) VALUES (?, CASE WHEN (${condition}) THEN 1 ELSE 0 END)`).bind(id, ...values);
}
export function clearGuards(db: D1Database, ids: string[]): D1PreparedStatement {
  return db.prepare(`DELETE FROM operation_guards WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids);
}
export async function assertWorker(db: D1Database, principal: Principal): Promise<void> {
  if (principal.role !== "WORKER" || !await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'WORKER' AND is_active = 1").bind(principal.userId).first()) {
    throw new ApiError(403, "WORKER_REQUIRED", "Tu cuenta no tiene acceso activo a la ruta.");
  }
}
export async function assertAssignment(db: D1Database, principal: Principal, dispatchId: string, open = false): Promise<void> {
  await assertWorker(db, principal);
  const assigned = await db.prepare("SELECT d.id, d.status FROM route_dispatches d JOIN dispatch_workers w ON w.dispatch_id = d.id WHERE d.id = ? AND w.worker_user_id = ?")
    .bind(dispatchId, principal.userId).first<{ id: string; status: string }>();
  if (!assigned) throw new ApiError(403, "DISPATCH_FORBIDDEN", "No tienes este recorrido asignado.");
  if (open && assigned.status !== "OPEN") throw new ApiError(409, "DISPATCH_CLOSED", "El recorrido ya está cerrado; conserva el pendiente para revisión.");
}
