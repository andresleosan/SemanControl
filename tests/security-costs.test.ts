import { describe, expect, it } from "vitest";

const worker = { userId: "worker", firebaseUid: "uid", email: "worker@example.com", name: "Trabajador", role: "WORKER" as const, clientId: null };
const admin = { ...worker, role: "ADMIN" as const };
const product = { id: "p1", name: "Arroz", credit_price: 8000, total_stock: 10, is_active: 1, cost_price: 5000, internal: "omit" };

describe("product cost isolation", () => {
  it("projects public product data through an explicit allowlist", async () => {
    const { toPublicProduct } = await import("../src/lib/security/products");
    expect(toPublicProduct(product)).toEqual({ id: "p1", name: "Arroz", credit_price: 8000, total_stock: 10, is_active: 1 });
  });

  it("queries public product columns without selecting costs", async () => {
    const { PUBLIC_PRODUCT_COLUMNS, ADMIN_PRODUCT_COLUMNS } = await import("../src/lib/security/products");
    expect(PUBLIC_PRODUCT_COLUMNS.split(",").map((column) => column.trim())).toEqual(["id", "name", "credit_price", "total_stock", "is_active"]);
    expect(ADMIN_PRODUCT_COLUMNS.split(",").map((column) => column.trim())).toContain("cost_price");
  });

  it.each(["/api/ruta/products", "/api/adminish/products", "/admin/inventario", "/api/admin", "/api/admin/../ruta/products", "/api/admin/%2e%2e/ruta/products"])("denies cost access on %s even to ADMIN", async (pathname) => {
    const { assertAdminApiAccess } = await import("../src/lib/security/products");
    expect(() => assertAdminApiAccess(admin, pathname)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("requires ADMIN as well as the admin API pathname", async () => {
    const { assertAdminApiAccess } = await import("../src/lib/security/products");
    expect(() => assertAdminApiAccess(worker, "/api/admin/products")).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => assertAdminApiAccess(admin, "/api/admin/products")).not.toThrow();
  });

  it("rejects nested costs before serializing any public response", async () => {
    const { safeJsonResponse } = await import("../src/lib/security/products");
    expect(() => safeJsonResponse({ rows: [{ nested: { cost_price: 5000 } }] }, worker, "/api/ruta/products"))
      .toThrowError(expect.objectContaining({ status: 500, code: "COST_EXPOSURE" }));
    expect(() => safeJsonResponse({ rows: [{ cost_price: 5000 }] }, admin, "/api/ruta/products"))
      .toThrowError(expect.objectContaining({ code: "COST_EXPOSURE" }));
  });

  it("serializes allowed public DTOs and ADMIN cost responses", async () => {
    const { safeJsonResponse, toPublicProduct } = await import("../src/lib/security/products");
    expect(await safeJsonResponse(toPublicProduct(product), worker, "/api/ruta/products").json()).toEqual({ id: "p1", name: "Arroz", credit_price: 8000, total_stock: 10, is_active: 1 });
    expect(await safeJsonResponse({ cost_price: 5000 }, admin, "/api/admin/products").json()).toEqual({ cost_price: 5000 });
  });

  it("returns a generic internal error instead of leaking database details", async () => {
    const { errorResponse } = await import("../src/lib/security/errors");
    const response = errorResponse(new Error("D1 SQL secrets cost_price uid token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "No se pudo completar la solicitud." } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
