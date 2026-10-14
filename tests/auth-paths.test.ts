import { describe, expect, it } from "vitest";

describe("protected route roles", () => {
  it.each([
    ["/api/admin/inventario", ["ADMIN"]], ["/api/ruta/visita", ["WORKER"]], ["/api/mi-cuenta/historial", ["CLIENT"]],
    ["/admin/cierre", ["ADMIN"]], ["/ruta", ["WORKER"]], ["/ruta/cliente/1", ["WORKER"]],
    ["/mi-cuenta", ["CLIENT"]], ["/sesion", []], ["/login", null], ["/ruta-falsa", null],
  ])("requires persisted roles on %s", async (path, roles) => {
    const { requiredRolesForPath } = await import("../src/lib/auth/paths");
    expect(requiredRolesForPath(path)).toEqual(roles);
  });

  it.each([["ADMIN", "/admin/cierre"], ["WORKER", "/ruta"], ["CLIENT", "/mi-cuenta"]] as const)("returns the home for %s", async (role, home) => {
    const { roleHome } = await import("../src/lib/auth/paths");
    expect(roleHome(role)).toBe(home);
  });
});
