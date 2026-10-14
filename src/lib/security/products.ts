import "server-only";
import type { Principal } from "../auth/types";
import { ApiError } from "./errors";

export const PUBLIC_PRODUCT_COLUMNS = "id, name, credit_price, total_stock, is_active";
export const ADMIN_PRODUCT_COLUMNS = `${PUBLIC_PRODUCT_COLUMNS}, cost_price`;

export interface PublicProduct {
  id: string;
  name: string;
  credit_price: number;
  total_stock: number;
  is_active: number;
}
export function toPublicProduct(row: PublicProduct): PublicProduct {
  return { id: row.id, name: row.name, credit_price: row.credit_price, total_stock: row.total_stock, is_active: row.is_active };
}
function isAdminApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/") &&
    !/\\|%2f|%5c/i.test(pathname) &&
    new URL(pathname, "https://semancontrol.internal").pathname === pathname;
}
export function assertAdminApiAccess(principal: Principal, pathname: string): void {
  if (principal.role !== "ADMIN" || !isAdminApiPath(pathname)) {
    throw new ApiError(403, "ADMIN_API_REQUIRED", "El acceso a costos requiere una API de administrador.");
  }
}
function containsCost(data: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof data !== "object" || data === null || seen.has(data)) return false;
  seen.add(data);
  return Object.entries(data).some(([key, value]) => /(^|_)cost(_|$)/i.test(key) || containsCost(value, seen));
}
export function assertNoCostExposure(data: unknown, principal: Principal, pathname: string): void {
  if (containsCost(data) && (principal.role !== "ADMIN" || !isAdminApiPath(pathname))) {
    throw new ApiError(500, "COST_EXPOSURE", "No se pudo preparar una respuesta segura.");
  }
}
export function safeJsonResponse(data: unknown, principal: Principal, pathname: string, init: ResponseInit = {}): Response {
  // Inspect the serialized form too: custom toJSON methods cannot bypass the guard.
  const serialized = JSON.stringify(data);
  const publicData: unknown = JSON.parse(serialized);
  assertNoCostExposure(publicData, principal, pathname);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(serialized, { ...init, headers });
}
