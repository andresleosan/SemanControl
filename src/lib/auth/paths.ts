import type { Role } from "./types";

const homes: Record<Role, string> = { ADMIN: "/admin/cierre", WORKER: "/ruta", CLIENT: "/mi-cuenta" };
export function roleHome(role: Role): string { return homes[role]; }

export function requiredRolesForPath(pathname: string): readonly Role[] | null {
  if (/^\/api\/ruta\/incidencias\/[^/]+\/comprobante$/.test(pathname)) return ["WORKER", "ADMIN"];
  for (const [prefix, role] of [["/admin", "ADMIN"], ["/ruta", "WORKER"], ["/mi-cuenta", "CLIENT"], ["/api/admin", "ADMIN"], ["/api/ruta", "WORKER"], ["/api/mi-cuenta", "CLIENT"]] as const) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return [role];
  }
  return pathname === "/sesion" || pathname.startsWith("/sesion/") ? [] : null;
}
