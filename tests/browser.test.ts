import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, expect as browserExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { BrowserHarness, dispatchId, principals } from "./browser-fixture/harness";
import { registerVisit } from "../src/lib/operations/visits";
import { createDispatch } from "../src/lib/admin/write-model";

let browser: Browser, harness: BrowserHarness;
let contexts: BrowserContext[] = [], pages: Page[] = [], pageErrors: string[] = [];
let layouts: { path: string; width: number }[] = [];
beforeAll(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); }, 30000);
beforeEach(async () => { harness = new BrowserHarness(); await harness.start(); contexts = []; pages = []; pageErrors = []; layouts = []; }, 60000);
afterEach(async (context) => {
  if (context.task.result?.state === "fail") {
    const label = context.task.name.split(" ")[0];
    for (let index = 0; index < pages.length; index++) await pages[index].screenshot({ path: resolve(`.wrangler/test-browser/failure-${label}-${index}.png`), fullPage: true }).catch(() => undefined);
    const overflow = await Promise.all(pages.map((page) => page.evaluate(() => [...document.querySelectorAll("*")].map((node) => ({ tag: node.tagName, className: node.className, text: node.textContent?.slice(0, 100), width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, minWidth: getComputedStyle(node).minWidth })).filter((row) => row.right > innerWidth + 1 && row.width > 0))));
    await writeFile(resolve(`.wrangler/test-browser/failure-${label}.json`), JSON.stringify({ visits: harness.visits, responses: harness.responses, pageErrors, overflow }, null, 2));
  }
  await Promise.all(contexts.map((context) => context.close()));
  await harness?.stop();
}, 30000);
afterAll(async () => { await browser?.close(); });

async function open(role: keyof typeof principals, path: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "es-CO", timezoneId: "America/Bogota" });
  contexts.push(context);
  await context.addCookies([{ name: "browser_fixture", value: role, url: harness.origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage(); pages.push(page);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${harness.origin}${path}`);
  return page;
}
async function mobileLayout(page: Page) {
  layouts.push({ path: new URL(page.url()).pathname, width: await page.evaluate(() => document.documentElement.scrollWidth) });
}
function verifyBrowser() { expect(pageErrors).toEqual([]); expect(layouts.filter((layout) => layout.width > 390), "Horizontal page overflow at 390px").toEqual([]); }
async function queue(page: Page) {
  return page.evaluate(() => new Promise<{ key: string; state: string; resolved_by?: string; photoType?: string; photoSize?: number; payload: { idempotency_key: string; payment_amount: number; client_id: string } }[]>((done, fail) => {
    const open = indexedDB.open("semancontrol-private-route", 1);
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("queue").objectStore("queue").getAll();
      read.onerror = () => { db.close(); fail(read.error); };
      read.onsuccess = () => { db.close(); done(read.result.map((row) => ({ key: row.key, state: row.state, resolved_by: row.resolved_by, photoType: row.photo?.type, photoSize: row.photo?.size, payload: row.payload }))); };
    };
  }));
}
async function snapshot(page: Page, name: string) { await mobileLayout(page); await page.screenshot({ path: resolve(`.wrangler/test-browser/${name}.png`), animations: "disabled" }); }
async function observedAt(page: Page, scope: string) {
  return page.evaluate(({ uid, scope }) => new Promise<string | null>((done, fail) => {
    const open = indexedDB.open("semancontrol-private-route", 1);
    open.onerror = () => fail(open.error);
    open.onsuccess = () => { const db = open.result; const read = db.transaction("snapshots").objectStore("snapshots").get(JSON.stringify([uid, scope])); read.onsuccess = () => { db.close(); done(read.result?.observed_at ?? null); }; read.onerror = () => { db.close(); fail(read.error); }; };
  }), { uid: principals.worker.firebaseUid, scope });
}
async function renderSettled(page: Page) { await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); }
async function visitCount() { return (await harness.db.prepare("SELECT COUNT(*) n FROM ledger_movements WHERE movement_type='VISIT'").first<{ n: number }>())!.n; }
async function clientState(id = "client-demo-01") { return harness.db.prepare("SELECT current_balance,revision FROM clients WHERE id=?").bind(id).first(); }

describe("actual UI against isolated D1/R2 at 390 × 844", () => {
  it("looks up client debts from worker navigation without requiring an assigned route", async () => {
    const worker = await open("worker", `/ruta?dispatch_id=${dispatchId}`);
    await worker.getByRole("link", { name: "Clientes", exact: true }).click();
    await browserExpect(worker.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
    await browserExpect(worker.getByRole("link", { name: "Clientes", exact: true })).toHaveAttribute("aria-current", "page");
    await browserExpect(worker.getByRole("link", { name: "Mi ruta", exact: true })).toHaveAttribute("href", `/ruta?dispatch_id=${dispatchId}`);
    const cards = worker.getByRole("article");
    await browserExpect(cards).toHaveCount(10);
    await worker.getByLabel("Buscar cliente").fill("#1");
    await browserExpect(cards).toHaveCount(1);
    await browserExpect(cards).toContainText("Cliente de prueba 01");
    await browserExpect(cards).toContainText("Deuda actual");
    await browserExpect(cards).toContainText("65.000");
    await worker.getByLabel("Buscar cliente").fill("arbol");
    await browserExpect(cards).toHaveCount(1);
    await browserExpect(cards).toContainText("Cliente de prueba 05");
    await worker.getByLabel("Buscar cliente").fill("");
    await worker.getByRole("button", { name: "Al día", exact: true }).click();
    await browserExpect(cards).toHaveCount(1);
    await browserExpect(cards).toContainText("Cliente de prueba 04");
    await worker.getByRole("button", { name: "A favor", exact: true }).click();
    await browserExpect(cards).toHaveCount(1);
    await browserExpect(cards).toContainText("Saldo a favor");
    await browserExpect(cards).toContainText("5.000");
    await worker.getByRole("button", { name: "Con deuda", exact: true }).click();
    await browserExpect(cards).toHaveCount(8);
    await worker.getByLabel("Buscar cliente").fill("no existe esta tarjeta");
    await browserExpect(worker.getByText("No hay clientes que coincidan con tu búsqueda y filtro.")).toBeVisible();
    await worker.getByLabel("Buscar cliente").fill("");
    await worker.getByRole("button", { name: "Todos", exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await worker.setViewportSize({ width, height: 900 });
      expect(await worker.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await worker.setViewportSize({ width: 390, height: 844 });
    await snapshot(worker, "worker-clients");
    expect(await visitCount()).toBe(0);
    expect(harness.responses.findLast((row) => row.path === "/api/ruta/clientes")?.body).not.toMatch(/cost_price|linked_email|firebase_uid|estimated_margin/);
    await harness.db.prepare("DELETE FROM dispatch_workers WHERE worker_user_id=?").bind(principals.worker.userId).run();
    await worker.goto(`${harness.origin}/ruta/clientes`);
    await browserExpect(cards).toHaveCount(10);
    verifyBrowser();
  }, 60000);

  it("labels saved client debts after a failed refresh and hides them when access is revoked", async () => {
    const worker = await open("worker", "/ruta/clientes");
    const cards = worker.getByRole("article");
    await browserExpect(cards).toHaveCount(10);
    await browserExpect.poll(() => observedAt(worker, "worker-clients")).not.toBeNull();
    await worker.route("**/api/ruta/clientes", (route) => route.abort("internetdisconnected"));
    await worker.getByRole("button", { name: "Actualizar clientes", exact: true }).click();
    await browserExpect(worker.getByText(/No pudimos actualizar.*última consulta:/)).toBeVisible();
    await browserExpect(cards).toHaveCount(10);
    await worker.context().setOffline(true);
    await browserExpect(worker.getByText(/Sin conexión.*última consulta:/)).toBeVisible();
    await worker.context().setOffline(false);
    await worker.unroute("**/api/ruta/clientes");
    await worker.route("**/api/ruta/clientes", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "ACCOUNT_DISABLED", message: "Tu acceso está desactivado." } }) }));
    await browserExpect(worker.getByRole("button", { name: "Actualizar clientes", exact: true })).toBeEnabled();
    await worker.getByRole("button", { name: "Actualizar clientes", exact: true }).click();
    await browserExpect(worker.getByRole("alert")).toContainText("Tu acceso está desactivado.");
    await browserExpect(cards).toHaveCount(0);
    await worker.unroute("**/api/ruta/clientes");
    await worker.route("**/api/ruta/clientes", (route) => route.abort("internetdisconnected"));
    await worker.getByRole("button", { name: "Actualizar clientes", exact: true }).click();
    await browserExpect(worker.getByRole("button", { name: "Actualizar clientes", exact: true })).toBeEnabled();
    await browserExpect(cards).toHaveCount(0);
    await worker.unroute("**/api/ruta/clientes");
    await worker.getByRole("button", { name: "Actualizar clientes", exact: true }).click();
    await browserExpect(cards).toHaveCount(10);
    verifyBrowser();
  }, 60000);

  it("recovers a lost response once, uploads browser WebP, declares cash and exposes a private-cost-free client history", async () => {
    const worker = await open("worker", `/ruta?dispatch_id=${dispatchId}`);
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 01/ })).toBeVisible();
    await worker.getByLabel("Buscar tarjeta").fill("puerta azul");
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 02/ })).toBeVisible();
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 01/ })).toHaveCount(0);
    await worker.getByLabel("Buscar tarjeta").fill("");
    await worker.getByRole("button", { name: "Visitados hoy", exact: true }).click();
    await browserExpect(worker.getByText("No hay tarjetas en este filtro.")).toBeVisible();
    await worker.getByRole("button", { name: "Pendientes hoy", exact: true }).click();
    await worker.getByRole("link", { name: /Cliente de prueba 01/ }).click();
    await worker.getByLabel("Abono en pesos").fill("10000");
    const addRice = worker.getByRole("button", { name: "Añadir una unidad de Arroz de prueba 1 kg", exact: true });
    await addRice.click(); await addRice.click();
    await browserExpect(worker.getByLabel("Cantidad de Arroz de prueba 1 kg", { exact: true })).toHaveText("2");
    await mobileLayout(worker);
    // Forward the real POST and discard its committed response before the renderer
    // can read it. Abrupt server socket closure can make Chrome retry automatically.
    let discardResponse = true;
    await worker.route("**/api/ruta/visita", async (route) => {
      if (discardResponse) { discardResponse = false; await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await worker.getByRole("button", { name: "Guardar visita", exact: true }).click();
    await browserExpect(worker.getByText("Visita conservada en este teléfono. Pendiente de sincronizar.", { exact: true })).toBeVisible();
    expect(await visitCount()).toBe(1);
    expect(await clientState()).toEqual({ current_balance: 65000, revision: 1 });
    expect(await harness.db.prepare("SELECT total_stock FROM products WHERE id='product-demo-1'").first()).toEqual({ total_stock: 98 });
    expect(await harness.db.prepare("SELECT remaining_qty FROM dispatch_inventory WHERE product_id='product-demo-1'").first()).toEqual({ remaining_qty: 28 });
    const original = (await queue(worker))[0]; expect(original.state).toBe("pending");
    // Reopen the same stored operation. Real useQueue/syncRoute replays its UUID.
    await worker.goto(`${harness.origin}/ruta/cliente/client-demo-01?dispatch_id=${dispatchId}`);
    await browserExpect.poll(async () => (await queue(worker))[0]?.state).toBe("registered");
    expect(await visitCount()).toBe(1);
    expect(harness.visits).toHaveLength(2);
    expect(harness.visits[1].payload.idempotency_key).toBe(original.payload.idempotency_key);
    expect(harness.visits[1].response).toMatchObject({ replayed: true });
    await snapshot(worker, "worker-visit");
    await worker.getByRole("link", { name: "Volver a mi ruta", exact: true }).click();
    await worker.getByRole("button", { name: "Visitados hoy", exact: true }).click();
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 01/ })).toBeVisible();
    await worker.getByRole("button", { name: "Todos", exact: true }).click();
    await worker.getByRole("link", { name: /Cliente de prueba 01/ }).click();
    await worker.getByLabel("Abono en pesos").fill("5000");
    await worker.getByRole("button", { name: "Transferencia", exact: true }).click();
    // Produce a real PNG in the browser; production compressReceipt must turn it into WebP.
    const photo = await worker.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 900; const drawing = canvas.getContext("2d")!; drawing.fillStyle = "white"; drawing.fillRect(0, 0, 1200, 900); drawing.fillStyle = "black"; drawing.font = "48px sans-serif"; drawing.fillText("Comprobante sintético: COP 5000", 60, 140); drawing.fillText("Referencia QA / 2026-10-14", 60, 240); return canvas.toDataURL("image/png").split(",")[1]; });
    await worker.getByLabel("Tomar o elegir foto del comprobante").setInputFiles({ name: "comprobante.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
    await browserExpect(worker.getByAltText("Vista previa del comprobante de transferencia")).toBeVisible();
    await worker.getByLabel("Se leen importe, fecha y referencia bancaria").check();
    await worker.getByRole("button", { name: "Guardar visita", exact: true }).click();
    await browserExpect(worker.getByText("Visita registrada por el servidor.", { exact: true })).toBeVisible();
    expect(await clientState()).toEqual({ current_balance: 60000, revision: 2 });
    const transferQueue = (await queue(worker)).find((row) => row.payload.payment_amount === 5000)!;
    expect(transferQueue).toMatchObject({ state: "registered", photoType: "image/webp" });
    const receipt = await harness.db.prepare("SELECT byte_size,width,height FROM receipts").first<{ byte_size: number; width: number; height: number }>();
    expect(receipt!.byte_size).toBeLessThan(100 * 1024); expect(receipt!.width).toBeLessThanOrEqual(1000);
    expect((await harness.bucket.list()).objects).toHaveLength(1);
    await worker.goto(`${harness.origin}/ruta/resumen?dispatch_id=${dispatchId}`);
    await browserExpect(worker.getByText("Efectivo que tú debes entregar", { exact: true }).locator("..")).toContainText("10.000");
    await worker.getByRole("button", { name: "Ya sincronicé todos mis pendientes", exact: true }).click();
    await browserExpect(worker.getByText("Declaración registrada. El jefe puede revisar tu cuadre.", { exact: true })).toBeVisible();
    expect(await harness.db.prepare("SELECT pending_sync_confirmed_at IS NOT NULL confirmed FROM dispatch_workers WHERE worker_user_id='worker-demo-1'").first()).toEqual({ confirmed: 1 });
    await mobileLayout(worker);

    const admin = await open("admin", "/admin/cierre");
    await admin.getByLabel("Recorrido a revisar").selectOption(dispatchId);
    const review = admin.getByRole("article").filter({ hasText: "Cliente de prueba 01" });
    await browserExpect(review.getByAltText("Comprobante de transferencia para revisión bancaria")).toBeVisible();
    await review.getByRole("button", { name: "Confirmar en banco", exact: true }).click();
    await browserExpect(review.getByRole("button", { name: "Confirmar en banco", exact: true })).toBeDisabled();
    expect(await clientState()).toEqual({ current_balance: 60000, revision: 2 });
    await review.getByLabel("Motivo de la revisión").fill("Banco informó reversión del pago sintético");
    await review.getByRole("button", { name: "Rechazar definitivamente", exact: true }).click();
    await browserExpect(review.getByText("El reverso de esta transferencia ya está registrado.", { exact: true })).toBeVisible();
    expect(await clientState()).toEqual({ current_balance: 65000, revision: 3 });
    expect(await harness.db.prepare("SELECT COUNT(*) n FROM ledger_movements WHERE movement_type='TRANSFER_REVERSAL'").first()).toEqual({ n: 1 });
    await snapshot(admin, "admin-reconciliation");

    const client = await open("client", "/mi-cuenta");
    await browserExpect(client.getByText("Tu saldo pendiente actual", { exact: true }).locator("..")).toContainText("65.000");
    await browserExpect(client.getByText("Arroz de prueba 1 kg", { exact: true })).toBeVisible();
    await browserExpect(client.getByText("Reverso de transferencia", { exact: true })).toBeVisible();
    await browserExpect(client.getByRole("link", { name: "Bodega", exact: true })).toHaveCount(0);
    const accountResponse = harness.responses.findLast((row) => row.path === "/api/mi-cuenta" && row.status === 200)!;
    expect(accountResponse.body).not.toMatch(/cost_price|unit_cost_price|r2_key|request_hash|firebase_uid/);
    const denied = await client.evaluate(async () => (await fetch("/api/admin/inventario")).status);
    expect(denied).toBe(403);
    await snapshot(client, "client-history");
    verifyBrowser();
  }, 90000);

  it("persists a physical payment offline, detects a stale revision and keeps the original during explicit reconciliation", async () => {
    const worker = await open("worker", `/ruta/cliente/client-demo-01?dispatch_id=${dispatchId}`);
    await browserExpect(worker.getByLabel("Abono en pesos")).toBeEnabled();
    await worker.getByLabel("Abono en pesos").fill("5000");
    await worker.context().setOffline(true);
    await worker.getByRole("button", { name: "Guardar visita", exact: true }).click();
    await browserExpect(worker.getByText("Visita conservada en este teléfono. Pendiente de sincronizar.", { exact: true })).toBeVisible();
    expect(await visitCount()).toBe(0);
    const original = (await queue(worker))[0]; expect(original.payload.payment_amount).toBe(5000);
    await registerVisit(harness.db, principals.worker2, { idempotency_key: crypto.randomUUID(), dispatch_id: dispatchId, client_id: "client-demo-01", expected_revision: 0, expected_balance: 65000, payment_amount: 1000, payment_method: "CASH", items: [] });
    await worker.context().setOffline(false);
    await browserExpect.poll(async () => (await queue(worker))[0]?.state).toBe("conflict");
    await browserExpect(worker.getByRole("button", { name: "Guardar visita", exact: true })).toHaveCount(0);
    await worker.getByRole("button", { name: "Revisar cambios para confirmar", exact: true }).click();
    await browserExpect(worker.getByText("Confirma el cobro que ya recibiste", { exact: true })).toBeVisible();
    await worker.getByRole("button", { name: "Confirmar mismo cobro y entrega", exact: true }).click();
    await browserExpect.poll(async () => (await queue(worker)).filter((row) => row.state === "registered").length).toBe(1);
    const retained = await queue(worker);
    expect(retained).toHaveLength(2);
    expect(retained.find((row) => row.key === original.key)).toMatchObject({ state: "conflict", resolved_by: retained.find((row) => row.state === "registered")!.key });
    expect(await clientState()).toEqual({ current_balance: 59000, revision: 2 });
    expect(await visitCount()).toBe(2);
    await mobileLayout(worker); verifyBrowser();
  }, 60000);

  it("creates and edits stock, purchases, reserves a dispatch, adjusts a card and closes only after a worker declaration", async () => {
    const admin = await open("admin", "/admin/inventario");
    await admin.getByLabel("Nombre del producto", { exact: true }).fill("Producto QA navegador");
    await admin.getByLabel("Costo actual (COP)", { exact: true }).fill("2000");
    await admin.getByLabel("Precio fiado (COP)", { exact: true }).fill("3500");
    await admin.getByLabel("Motivo del cambio", { exact: true }).fill("Alta sintética QA");
    await admin.getByRole("button", { name: "Guardar producto", exact: true }).click();
    await browserExpect(admin.getByText("Producto creado. Registra una compra para agregar unidades.", { exact: true })).toBeVisible();
    const product = await harness.db.prepare("SELECT id FROM products WHERE name='Producto QA navegador'").first<{ id: string }>();
    const productRow = admin.getByRole("row").filter({ hasText: "Producto QA navegador" });
    await productRow.getByRole("button", { name: "Editar", exact: true }).click();
    await admin.getByLabel("Precio fiado (COP)", { exact: true }).fill("4000");
    await admin.getByLabel("Motivo del cambio", { exact: true }).fill("Precio actualizado QA");
    await admin.getByRole("button", { name: "Guardar producto", exact: true }).click();
    await browserExpect(admin.getByText("Producto guardado.", { exact: true })).toBeVisible();
    await admin.getByRole("combobox", { name: /^Producto/ }).selectOption(product!.id);
    await admin.getByLabel("Unidades compradas", { exact: true }).fill("12");
    await admin.getByLabel("Costo unitario de esta compra (COP)", { exact: true }).fill("2100");
    await admin.getByLabel("Motivo o referencia", { exact: true }).fill("Compra sintética QA");
    await admin.getByRole("button", { name: "Registrar compra", exact: true }).click();
    await browserExpect(admin.getByText("Compra registrada.", { exact: true })).toBeVisible();
    expect(await harness.db.prepare("SELECT total_stock,cost_price,credit_price FROM products WHERE id=?").bind(product!.id).first()).toEqual({ total_stock: 12, cost_price: 2100, credit_price: 4000 });
    await admin.getByRole("button", { name: "Armar recorridos", exact: true }).click();
    await admin.getByLabel("Nombre del recorrido", { exact: true }).fill("Recorrido QA navegador");
    await admin.getByLabel("Fecha de salida", { exact: true }).fill("2026-10-16");
    await admin.getByLabel("Trabajador de prueba 1", { exact: true }).check();
    await admin.getByLabel("Unidades de Producto QA navegador para el recorrido", { exact: true }).fill("7");
    await admin.getByRole("button", { name: "Crear y despachar recorrido", exact: true }).click();
    await browserExpect(admin.getByText("Recorrido creado y carga reservada.", { exact: true })).toBeVisible();
    const dispatch = await harness.db.prepare("SELECT id FROM route_dispatches WHERE name='Recorrido QA navegador'").first<{ id: string }>();
    expect(await harness.db.prepare("SELECT total_stock FROM products WHERE id=?").bind(product!.id).first()).toEqual({ total_stock: 12 });
    expect(await harness.db.prepare("SELECT remaining_qty FROM dispatch_inventory WHERE dispatch_id=?").bind(dispatch!.id).first()).toEqual({ remaining_qty: 7 });
    await mobileLayout(admin);
    await admin.getByRole("link", { name: "Tarjetas", exact: true }).click();
    await admin.getByLabel("Buscar nombre, dirección, número o correo", { exact: true }).fill("Cliente de prueba 01");
    const cardRow = admin.getByRole("row").filter({ hasText: "Cliente de prueba 01" });
    await cardRow.getByRole("button", { name: /Historial|Ver tarjeta/ }).click();
    await admin.getByLabel("Cambio del saldo (COP, con signo)", { exact: true }).fill("-3000");
    await admin.getByLabel("Motivo de la corrección", { exact: true }).fill("Corrección física QA");
    await admin.getByRole("button", { name: "Registrar ajuste", exact: true }).click();
    await browserExpect(admin.getByText("Ajuste registrado en el historial.", { exact: true })).toBeVisible();
    expect(await clientState()).toEqual({ current_balance: 62000, revision: 1 });
    expect(await harness.db.prepare("SELECT COUNT(*) n FROM ledger_movements WHERE movement_type='ADJUSTMENT'").first()).toEqual({ n: 1 });
    await mobileLayout(admin);
    await admin.getByRole("link", { name: "Cierre", exact: true }).click();
    await admin.getByRole("combobox", { name: /^Recorrido a revisar/ }).selectOption(dispatch!.id);
    const close = admin.getByRole("button", { name: "Confirmar devolución y cerrar recorrido", exact: true });
    await browserExpect(close).toBeDisabled();
    const worker = await open("worker", `/ruta/resumen?dispatch_id=${dispatch!.id}`);
    await worker.getByRole("button", { name: "Ya sincronicé todos mis pendientes", exact: true }).click();
    await browserExpect(worker.getByText("Declaración registrada. El jefe puede revisar tu cuadre.", { exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Actualizar", exact: true }).click();
    await browserExpect(admin.getByText("Sincronización declarada", { exact: true })).toBeVisible();
    await admin.getByLabel("Efectivo recibido físicamente (COP)", { exact: true }).fill("0");
    await admin.getByLabel("Cantidad devuelta de Producto QA navegador", { exact: true }).fill("6");
    await admin.getByLabel("Motivo de las diferencias (obligatorio)", { exact: true }).fill("Faltó una unidad en conteo físico QA");
    await admin.getByLabel("Confirmo que recibí y conté el efectivo y los productos indicados.", { exact: true }).check();
    await close.click();
    await browserExpect(admin.getByRole("heading", { name: "Recorrido cerrado", exact: true })).toBeVisible();
    expect(await harness.db.prepare("SELECT status FROM route_dispatches WHERE id=?").bind(dispatch!.id).first()).toEqual({ status: "CLOSED" });
    expect(await harness.db.prepare("SELECT total_stock FROM products WHERE id=?").bind(product!.id).first()).toEqual({ total_stock: 11 });
    expect(await harness.db.prepare("SELECT expected_qty,received_qty FROM dispatch_returns WHERE dispatch_id=?").bind(dispatch!.id).first()).toEqual({ expected_qty: 7, received_qty: 6 });
    await mobileLayout(admin); verifyBrowser();
  }, 90000);

  it("serves the actual offline service worker after an asset redirect without caching private HTML or API data", async () => {
    const worker = await open("worker", `/ruta?dispatch_id=${dispatchId}`);
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 01/ })).toBeVisible();
    await worker.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>((done) => navigator.serviceWorker.addEventListener("controllerchange", () => done(), { once: true }));
      await fetch("/api/ruta");
      await fetch("/ruta");
      await fetch("/ruta", { headers: { RSC: "1" } });
    });
    const cacheUrls = await worker.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat());
    expect(cacheUrls).toContain("/offline.html");
    expect(cacheUrls).not.toContain("/ruta"); expect(cacheUrls.some((path) => path.startsWith("/api/"))).toBe(false);
    await worker.context().setOffline(true);
    await worker.goto(`${harness.origin}/ruta?reload-offline=1`);
    await browserExpect(worker.getByRole("heading", { name: "Tu ruta sigue conservada", exact: true })).toBeVisible();
    await browserExpect(worker.getByText("No borres los datos del navegador ni repitas un cobro que ya recibiste.", { exact: true })).toBeVisible();
    await mobileLayout(worker); verifyBrowser();
  }, 60000);

  it("keeps the selected route readable when the previous route responds late", async () => {
    const next = await createDispatch(harness.db, principals.admin, { name: "Otra ruta QA", dispatch_date: "2026-10-16", worker_ids: ["worker-demo-1"], items: [{ product_id: "product-demo-1", qty: 1 }] });
    const worker = await open("worker", `/ruta?dispatch_id=${next.id}`);
    await browserExpect(worker.getByText("Arroz de prueba 1 kg: 1 restantes", { exact: true })).toBeVisible();
    const previous = await observedAt(worker, `client:${next.id}:client-demo-10`);
    let release!: () => void, started!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const waiting = new Promise<void>((done) => { started = done; });
    await worker.route(`**/api/ruta?dispatch_id=${dispatchId}`, async (route) => {
      const response = await route.fetch(); started(); await held; await route.fulfill({ response });
    });
    const select = worker.getByRole("combobox", { name: /^Recorrido asignado/ });
    await select.selectOption(dispatchId); await waiting;
    await select.selectOption(next.id);
    await browserExpect.poll(() => observedAt(worker, `client:${next.id}:client-demo-10`)).not.toBe(previous);
    await renderSettled(worker);
    await browserExpect(worker.getByText("Arroz de prueba 1 kg: 1 restantes", { exact: true })).toBeVisible();
    const delivered = worker.waitForResponse((response) => response.url().endsWith(`/api/ruta?dispatch_id=${dispatchId}`));
    release(); await delivered;
    // HTTP completion precedes snapshot writes and React state. Wait for the last
    // card snapshot from A and two render frames before checking the selected B.
    await browserExpect.poll(() => observedAt(worker, `client:${dispatchId}:client-demo-10`)).not.toBeNull();
    await renderSettled(worker);
    await browserExpect(select).toHaveValue(next.id);
    await browserExpect(worker.getByText("Arroz de prueba 1 kg: 1 restantes", { exact: true })).toBeVisible();
    await browserExpect(worker.getByRole("link", { name: /Cliente de prueba 01/ })).toBeVisible();
    await mobileLayout(worker); verifyBrowser();
  }, 60000);

  it("keeps the selected cash summary readable when the previous summary responds late", async () => {
    const next = await createDispatch(harness.db, principals.admin, { name: "Cuadre alterno QA", dispatch_date: "2026-10-16", worker_ids: ["worker-demo-1"], items: [{ product_id: "product-demo-1", qty: 1 }] });
    const worker = await open("worker", `/ruta/resumen?dispatch_id=${next.id}`);
    await browserExpect(worker.getByRole("heading", { name: "Sobrante físico del recorrido", exact: true })).toBeVisible();
    const previous = await observedAt(worker, `summary:${next.id}`);
    let release!: () => void, started!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const waiting = new Promise<void>((done) => { started = done; });
    await worker.route(`**/api/ruta/resumen?dispatch_id=${dispatchId}`, async (route) => {
      const response = await route.fetch(); started(); await held; await route.fulfill({ response });
    });
    const select = worker.getByRole("combobox", { name: /^Recorrido/ });
    await select.selectOption(dispatchId); await waiting;
    await select.selectOption(next.id);
    await browserExpect.poll(() => observedAt(worker, `summary:${next.id}`)).not.toBe(previous);
    await renderSettled(worker);
    const delivered = worker.waitForResponse((response) => response.url().endsWith(`/api/ruta/resumen?dispatch_id=${dispatchId}`));
    release(); await delivered;
    await browserExpect.poll(() => observedAt(worker, `summary:${dispatchId}`)).not.toBeNull();
    await renderSettled(worker);
    await browserExpect(select).toHaveValue(next.id);
    await browserExpect(worker.getByRole("heading", { name: "Sobrante físico del recorrido", exact: true })).toBeVisible();
    await browserExpect(worker.getByRole("row").filter({ hasText: "Arroz de prueba 1 kg" }).getByRole("cell").nth(2)).toHaveText("1");
    await mobileLayout(worker); verifyBrowser();
  }, 60000);

  it("creates one physical card with its opening debt after losing the first creation response", async () => {
    const admin = await open("admin", "/admin/clientes");
    await admin.getByRole("button", { name: "Nueva tarjeta", exact: true }).click();
    await admin.getByLabel("Nombre del cliente", { exact: true }).fill("Tarjeta física QA");
    await admin.getByLabel("Dirección", { exact: true }).fill("Calle sintética # 11");
    await admin.getByLabel("Referencia de la casa", { exact: true }).fill("Puerta verde de prueba");
    await admin.getByLabel("Saldo de apertura de tarjeta física (COP)", { exact: true }).fill("65000");
    await admin.getByLabel("Motivo del alta o cambio", { exact: true }).fill("Transcripción de tarjeta física sintética");
    await mobileLayout(admin);
    const bodies: Record<string, unknown>[] = [];
    await admin.route("**/api/admin/clientes", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) { await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await admin.getByRole("button", { name: "Guardar tarjeta", exact: true }).click();
    await browserExpect(admin.getByRole("alert")).toBeVisible();
    await browserExpect(admin.getByLabel("Saldo de apertura de tarjeta física (COP)", { exact: true })).toHaveValue("65000");
    const original = await harness.db.prepare("SELECT id,current_balance,revision,route_order FROM clients WHERE name='Tarjeta física QA'").first<{ id: string; current_balance: number; revision: number; route_order: number }>();
    expect(original).toMatchObject({ current_balance: 65000, revision: 1, route_order: 11 });
    await admin.getByRole("button", { name: "Guardar tarjeta", exact: true }).click();
    await browserExpect(admin.getByText("Tarjeta creada y saldo de apertura registrado.", { exact: true })).toBeVisible();
    await browserExpect(admin.getByRole("heading", { name: "Historial y saldo de la tarjeta", exact: true })).toBeVisible();
    expect(bodies).toHaveLength(2); expect(bodies[1].idempotency_key).toBe(bodies[0].idempotency_key); expect(bodies[0].idempotency_key).toMatch(/^[a-f\d-]{36}$/i);
    expect(await harness.db.prepare("SELECT COUNT(*) n FROM clients WHERE name='Tarjeta física QA'").first()).toEqual({ n: 1 });
    expect(await harness.db.prepare("SELECT movement_type,previous_balance,adjustment_amount,new_balance,client_sequence FROM ledger_movements WHERE client_id=?").bind(original!.id).all()).toMatchObject({ results: [{ movement_type: "OPENING", previous_balance: 0, adjustment_amount: 65000, new_balance: 65000, client_sequence: 1 }] });
    expect(await harness.db.prepare("SELECT current_balance,revision FROM clients WHERE id=?").bind(original!.id).first()).toEqual({ current_balance: 65000, revision: 1 });
    await mobileLayout(admin); verifyBrowser();
  }, 60000);
});
