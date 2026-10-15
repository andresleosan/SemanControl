import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { registerVisit } from "../src/lib/operations/visits";
import { cleanupOrphanReceipts, readReceipt, readReceiptForm, uploadReceipt } from "../src/lib/operations/receipts";
import { confirmSynchronized, createRouteClient, readRoute, readRouteClient, readRouteSummary, readWorkerClients } from "../src/lib/operations/route";

let mf: Miniflare;
let db: D1Database;
let bucket: R2Bucket;
const worker = { userId: "worker-demo-1", firebaseUid: "worker-uid-1", email: "trabajador1@semancontrol.example", name: "Trabajador 1", role: "WORKER" as const, clientId: null };
const worker2 = { ...worker, userId: "worker-demo-2", firebaseUid: "worker-uid-2" };
const dispatch = "route-demo-2026-10-16";
const admin = { ...worker, userId: "admin-demo", role: "ADMIN" as const };
// Static one-pixel WebP lossless sample (RIFF + VP8L).
const webp = new Uint8Array(Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64"));
function upload(overrides: Record<string, unknown> = {}) {
  return { receipt_id: crypto.randomUUID(), client_id: "client-demo-01", dispatch_id: dispatch, file: new Blob([webp], { type: "image/webp" }), ...overrides };
}
function visit(overrides: Record<string, unknown> = {}) {
  return { idempotency_key: crypto.randomUUID(), dispatch_id: dispatch, client_id: "client-demo-01", expected_revision: 0, expected_balance: 65000, payment_amount: 10000, payment_method: "CASH", items: [{ product_id: "product-demo-1", qty: 2, unit_credit_price: 5000 }], ...overrides };
}
async function balances() {
  return {
    client: await db.prepare("SELECT current_balance, revision FROM clients WHERE id = 'client-demo-01'").first(),
    stock: await db.prepare("SELECT total_stock FROM products WHERE id = 'product-demo-1'").first(),
    route: await db.prepare("SELECT remaining_qty FROM dispatch_inventory WHERE product_id = 'product-demo-1'").first(),
    visits: await db.prepare("SELECT COUNT(*) AS count FROM ledger_movements WHERE movement_type = 'VISIT'").first(),
  };
}

// Execute the complete production migrations, including their trigger bodies.
async function migrate(sql: string) {
  let statement = "";
  let trigger = false;
  for (const line of sql.split("\n")) {
    if (!statement && (!line.trim() || line.trim().startsWith("--"))) continue;
    statement += `${line}\n`;
    if (/CREATE TRIGGER/i.test(statement)) trigger = true;
    if ((!trigger && /;\s*$/.test(line)) || (trigger && /^END;\s*$/i.test(line.trim()))) {
      await db.prepare(statement).run();
      statement = ""; trigger = false;
    }
  }
}

beforeEach(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", compatibilityDate: "2026-10-14", d1Databases: ["DB"], r2Buckets: ["RECEIPTS_BUCKET"] }));
  db = await mf.getD1Database("DB") as unknown as D1Database;
  bucket = await mf.getR2Bucket("RECEIPTS_BUCKET") as unknown as R2Bucket;
  await migrate(await readFile(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  const operations = await readFile(new URL("../migrations/0002_operations.sql", import.meta.url), "utf8").catch(() => "");
  await migrate(operations);
  await migrate(await readFile(new URL("../migrations/0003_incidents.sql", import.meta.url), "utf8"));
  await migrate(await readFile(new URL("../seed.sql", import.meta.url), "utf8"));
});
afterEach(async () => { await mf?.dispose(); });

describe("operational schema", () => {
  it("does not create a customer card using an ADMIN or WORKER reserved email", async () => {
    const { createRouteClient } = await import("../src/lib/operations/route");
    await expect(createRouteClient(db, worker, { name: "Cliente", address: "Casa", address_reference: "Reja", linked_email: "admin@semancontrol.example" })).rejects.toMatchObject({ status: 409 });
    expect(await db.prepare("SELECT COUNT(*) count FROM clients").first()).toEqual({ count: 10 });
  });
  it("stores receipt ownership and revisions for atomic worker operations", async () => {
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'receipts'").first()).toEqual({ name: "receipts" });
    expect(await db.prepare("SELECT revision FROM clients WHERE id = 'client-demo-01'").first()).toEqual({ revision: 0 });
  });
});

describe("atomic visit operations", () => {
  it("posts one accounting movement, both stock deductions and a private cost snapshot", async () => {
    const result = await registerVisit(db, worker, visit());
    expect(result).toMatchObject({ replayed: false, movement: { previous_balance: 65000, payment_amount: 10000, charge_amount: 10000, new_balance: 65000, client_sequence: 1 } });
    expect(await balances()).toEqual({ client: { current_balance: 65000, revision: 1 }, stock: { total_stock: 98 }, route: { remaining_qty: 28 }, visits: { count: 1 } });
    expect(await db.prepare("SELECT unit_cost_price FROM movement_items WHERE movement_id = ?").bind(result.movement.id).first()).toEqual({ unit_cost_price: 3200 });
    expect(JSON.stringify(result)).not.toMatch(/cost_price|receipt_r2_key/);
  });

  it("returns the existing operation after a lost response without applying it twice", async () => {
    const payload = visit();
    const first = await registerVisit(db, worker, payload);
    const retried = await registerVisit(db, worker, payload);
    expect(retried).toEqual({ movement: first.movement, replayed: true });
    expect(await balances()).toEqual({ client: { current_balance: 65000, revision: 1 }, stock: { total_stock: 98 }, route: { remaining_qty: 28 }, visits: { count: 1 } });
  });

  it("rejects an idempotency key reused by another actor or with another original payload", async () => {
    const payload = visit();
    await registerVisit(db, worker, payload);
    await expect(registerVisit(db, worker2, payload)).rejects.toMatchObject({ status: 409 });
    await expect(registerVisit(db, worker, { ...payload, payment_amount: 12000 })).rejects.toMatchObject({ status: 409 });
    expect((await balances()).visits).toEqual({ count: 1 });
  });

  it("turns a zero-row stale balance update into a real SQL abort", async () => {
    const before = await balances();
    await expect(registerVisit(db, worker, visit({ expected_balance: 64000 }))).rejects.toMatchObject({ status: 409 });
    expect(await balances()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_guards").first()).toEqual({ count: 0 });
  });

  it("rolls back earlier stock and client changes if a later line has insufficient shared stock", async () => {
    const before = await balances();
    const payload = visit({ items: [{ product_id: "product-demo-1", qty: 2, unit_credit_price: 5000 }, { product_id: "product-demo-2", qty: 21, unit_credit_price: 10000 }] });
    await expect(registerVisit(db, worker, payload)).rejects.toMatchObject({ status: 409 });
    expect(await balances()).toEqual(before);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_guards").first()).toEqual({ count: 0 });
  });

  it("allows only one of two simultaneous workers to confirm the same client revision", async () => {
    const result = await Promise.allSettled([registerVisit(db, worker, visit()), registerVisit(db, worker2, visit())]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await balances()).toEqual({ client: { current_balance: 65000, revision: 1 }, stock: { total_stock: 98 }, route: { remaining_qty: 28 }, visits: { count: 1 } });
  });

  it("audits a visit with no payment and no products and invalidates synchronization", async () => {
    await db.prepare("UPDATE dispatch_workers SET pending_sync_confirmed_at = datetime('now') WHERE dispatch_id = ?").bind(dispatch).run();
    const result = await registerVisit(db, worker, visit({ payment_amount: 0, payment_method: "NONE", items: [] }));
    expect(result.movement).toMatchObject({ charge_amount: 0, payment_amount: 0, new_balance: 65000, movement_type: "VISIT" });
    expect(await db.prepare("SELECT pending_sync_confirmed_at FROM dispatch_workers WHERE dispatch_id = ? AND worker_user_id = ?").bind(dispatch, worker.userId).first()).toEqual({ pending_sync_confirmed_at: null });
    await expect(db.prepare("UPDATE dispatch_inventory SET initial_qty = initial_qty + 1 WHERE dispatch_id = ?").bind(dispatch).run()).rejects.toThrow(/DISPATCH_LOAD_FROZEN/);
  });

  it("confirms simultaneous retries with the same UUID as one immutable movement", async () => {
    const payload = visit();
    const results = await Promise.all([registerVisit(db, worker, payload), registerVisit(db, worker, payload)]);
    expect(results[0].movement.id).toBe(results[1].movement.id);
    expect(results.map((row) => row.replayed).sort()).toEqual([false, true]);
    expect(await balances()).toEqual({ client: { current_balance: 65000, revision: 1 }, stock: { total_stock: 98 }, route: { remaining_qty: 28 }, visits: { count: 1 } });
  });

  it("protects shared route stock even when workers visit different clients simultaneously", async () => {
    const items = [{ product_id: "product-demo-1", qty: 20, unit_credit_price: 5000 }];
    const results = await Promise.allSettled([registerVisit(db, worker, visit({ items })), registerVisit(db, worker2, visit({ client_id: "client-demo-02", expected_balance: 42000, items }))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.prepare("SELECT total_stock FROM products WHERE id = 'product-demo-1'").first()).toEqual({ total_stock: 80 });
    expect(await db.prepare("SELECT remaining_qty FROM dispatch_inventory WHERE product_id = 'product-demo-1'").first()).toEqual({ remaining_qty: 10 });
    expect(await db.prepare("SELECT SUM(revision) AS revisions FROM clients").first()).toEqual({ revisions: 1 });
  });

  it("preserves visit and stock audit history against update, delete and replace", async () => {
    await registerVisit(db, worker, visit());
    await expect(db.prepare("DELETE FROM audit_events WHERE action = 'CLIENT_VISITED'").run()).rejects.toThrow(/AUDIT_HISTORY_IMMUTABLE/);
    await expect(db.prepare("UPDATE audit_events SET reason = 'Alterado' WHERE action = 'CLIENT_VISITED'").run()).rejects.toThrow(/AUDIT_HISTORY_IMMUTABLE/);
    await expect(db.prepare("INSERT OR REPLACE INTO audit_events(id, actor_id, action, entity_id, reason) SELECT id, actor_id, action, entity_id, 'Alterado' FROM audit_events").run()).rejects.toThrow(/AUDIT_ID_ALREADY_EXISTS/);
    await db.prepare("INSERT INTO stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason) VALUES('stock-test','admin-demo','product-demo-1',0,98,98,'Registro físico')").run();
    await expect(db.prepare("DELETE FROM stock_events").run()).rejects.toThrow(/STOCK_HISTORY_IMMUTABLE/);
    await expect(db.prepare("UPDATE stock_events SET reason = 'Alterado'").run()).rejects.toThrow(/STOCK_HISTORY_IMMUTABLE/);
    await expect(db.prepare("INSERT OR REPLACE INTO stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason) VALUES('stock-test','admin-demo','product-demo-1',0,98,98,'Alterado')").run()).rejects.toThrow(/STOCK_EVENT_ID_ALREADY_EXISTS/);
  });

  it("denies an unassigned worker and refuses changed public prices without partial writes", async () => {
    const before = await balances();
    await db.prepare("DELETE FROM dispatch_workers WHERE dispatch_id = ? AND worker_user_id = ?").bind(dispatch, worker2.userId).run();
    await expect(registerVisit(db, worker2, visit())).rejects.toMatchObject({ status: 403 });
    await expect(registerVisit(db, worker, visit({ items: [{ product_id: "product-demo-1", qty: 1, unit_credit_price: 1 }] }))).rejects.toMatchObject({ status: 409 });
    expect(await balances()).toEqual(before);
  });
});

describe("private transfer receipts", () => {
  it("bounds multipart bodies before parsing and rejects ambiguous duplicate form fields", async () => {
    const form = new FormData();
    const input = upload();
    form.append("receipt_id", input.receipt_id); form.append("client_id", input.client_id); form.append("dispatch_id", input.dispatch_id); form.append("file", input.file, "proof.webp");
    const parsed = await readReceiptForm(new Request("http://localhost/api/comprobantes", { method: "POST", body: form }));
    expect(parsed).toMatchObject({ receipt_id: input.receipt_id, client_id: "client-demo-01", dispatch_id: dispatch });
    form.append("client_id", "client-demo-02");
    await expect(readReceiptForm(new Request("http://localhost/api/comprobantes", { method: "POST", body: form }))).rejects.toMatchObject({ status: 400 });
    await expect(readReceiptForm(new Request("http://localhost/api/comprobantes", { method: "POST", body: new Uint8Array(553001), headers: { "Content-Type": "multipart/form-data; boundary=abc" } }))).rejects.toMatchObject({ status: 413 });
  });
  it("uploads a UUID receipt once and verifies byte content, actor, client and dispatch on replay", async () => {
    const input = upload();
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    expect(await uploadReceipt(env, worker, input)).toEqual({ receipt_id: input.receipt_id });
    expect(await uploadReceipt(env, worker, input)).toEqual({ receipt_id: input.receipt_id });
    await expect(uploadReceipt(env, worker2, input)).rejects.toMatchObject({ status: 409 });
    await expect(uploadReceipt(env, worker, { ...input, client_id: "client-demo-02" })).rejects.toMatchObject({ status: 409 });
    const different = webp.slice(); different[different.length - 3] ^= 1;
    await expect(uploadReceipt(env, worker, { ...input, file: new Blob([different], { type: "image/webp" }) })).rejects.toMatchObject({ status: 409 });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM receipts").first()).toEqual({ count: 1 });
  });

  it("requires an assigned route and real bounded WebP headers", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    await expect(uploadReceipt(env, worker, upload({ file: new Blob(["fake"], { type: "image/webp" }) }))).rejects.toMatchObject({ status: 400 });
    await expect(uploadReceipt(env, worker, upload({ file: new Blob([new Uint8Array(512001)], { type: "image/webp" }) }))).rejects.toMatchObject({ status: 413 });
    const largeDimensions = webp.slice(); largeDimensions[21] = 0x40; largeDimensions[22] = 0x06;
    await expect(uploadReceipt(env, worker, upload({ file: new Blob([largeDimensions], { type: "image/webp" }) }))).rejects.toMatchObject({ status: 400 });
    await db.prepare("DELETE FROM dispatch_workers WHERE worker_user_id = ?").bind(worker2.userId).run();
    await expect(uploadReceipt(env, worker2, upload())).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM receipts").first()).toEqual({ count: 0 });
  });

  it("binds a transfer receipt once to its owner, card and route and exposes only its UUID", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    const receipt = await uploadReceipt(env, worker, upload());
    const before = await balances();
    await expect(registerVisit(db, worker2, visit({ payment_method: "TRANSFER", receipt_id: receipt.receipt_id }))).rejects.toMatchObject({ status: 409 });
    await expect(registerVisit(db, worker, visit({ client_id: "client-demo-02", expected_balance: 42000, payment_method: "TRANSFER", receipt_id: receipt.receipt_id }))).rejects.toMatchObject({ status: 409 });
    expect(await balances()).toEqual(before);
    const result = await registerVisit(db, worker, visit({ payment_method: "TRANSFER", receipt_id: receipt.receipt_id }));
    expect(result.movement).toMatchObject({ transfer_status: "PENDING", receipt_id: receipt.receipt_id });
    expect(JSON.stringify(result)).not.toContain("r2_key");
    await expect(registerVisit(db, worker, visit({ expected_revision: 1, payment_method: "TRANSFER", receipt_id: receipt.receipt_id }))).rejects.toMatchObject({ status: 409 });
    expect((await balances()).visits).toEqual({ count: 1 });
  });

  it("serves private files only to the owner, administrator and linked card after association", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    const receipt = await uploadReceipt(env, worker, upload());
    const client = { ...worker, userId: "client-demo-01", clientId: "client-demo-01", role: "CLIENT" as const };
    await db.prepare("UPDATE clients SET firebase_uid = ? WHERE id = ?").bind(client.firebaseUid, client.clientId).run();
    await expect(readReceipt(env, client, receipt.receipt_id)).rejects.toMatchObject({ status: 403 });
    await registerVisit(db, worker, visit({ payment_method: "TRANSFER", receipt_id: receipt.receipt_id }));
    expect((await readReceipt(env, client, receipt.receipt_id)).status).toBe(200);
    expect((await readReceipt(env, worker, receipt.receipt_id)).headers.get("Content-Type")).toBe("image/webp");
    expect((await readReceipt(env, admin, receipt.receipt_id)).status).toBe(200);
    await expect(readReceipt(env, worker2, receipt.receipt_id)).rejects.toMatchObject({ status: 403 });
    await expect(readReceipt(env, { ...client, clientId: "client-demo-02" }, receipt.receipt_id)).rejects.toMatchObject({ status: 403 });
  });

  it("lets only an administrator remove unassociated receipts older than 48 hours", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    const used = await uploadReceipt(env, worker, upload());
    const orphan = await uploadReceipt(env, worker, upload());
    await registerVisit(db, worker, visit({ payment_method: "TRANSFER", receipt_id: used.receipt_id }));
    await expect(cleanupOrphanReceipts(env, worker, new Date("2030-01-01T00:00:00Z"))).rejects.toMatchObject({ status: 403 });
    expect(await cleanupOrphanReceipts(env, admin, new Date("2030-01-01T00:00:00Z"))).toEqual({ deleted: 1 });
    expect(await db.prepare("SELECT id FROM receipts WHERE id = ?").bind(orphan.receipt_id).first()).toBeNull();
    expect((await readReceipt(env, worker, used.receipt_id)).status).toBe(200);
    await expect(db.prepare("DELETE FROM receipts WHERE id = ?").bind(used.receipt_id).run()).rejects.toThrow(/ASSOCIATED_RECEIPT_IMMUTABLE/);
  });

  it("retains cleanup metadata after a storage failure and blocks association until cleanup resumes", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    const receipt = await uploadReceipt(env, worker, upload());
    const unavailable = { DB: db, RECEIPTS_BUCKET: { async delete() { throw new Error("R2 temporarily unavailable"); } } as unknown as R2Bucket };
    await expect(cleanupOrphanReceipts(unavailable, admin, new Date("2030-01-01T00:00:00Z"))).rejects.toThrow("R2 temporarily unavailable");
    expect(await db.prepare("SELECT id FROM receipts WHERE id = ?").bind(receipt.receipt_id).first()).toEqual({ id: receipt.receipt_id });
    await expect(registerVisit(db, worker, visit({ payment_method: "TRANSFER", receipt_id: receipt.receipt_id }))).rejects.toMatchObject({ status: 409 });
    expect(await cleanupOrphanReceipts(env, admin, new Date("2030-01-01T00:00:00Z"))).toEqual({ deleted: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_guards").first()).toEqual({ count: 0 });
  });

  it("tracks objects left before metadata insertion and cleans them after 48 hours", async () => {
    const interrupted = {
      async put(key: string, bytes: ArrayBuffer, options: R2PutOptions) {
        const result = await bucket.put(key, bytes, options);
        await db.prepare("UPDATE route_dispatches SET status = 'CLOSED' WHERE id = ?").bind(dispatch).run();
        return result;
      },
      async delete() { throw new Error("R2 temporarily unavailable"); },
    } as unknown as R2Bucket;
    await expect(uploadReceipt({ DB: db, RECEIPTS_BUCKET: interrupted }, worker, upload())).rejects.toThrow("R2 temporarily unavailable");
    expect(await db.prepare("SELECT COUNT(*) AS count FROM receipts").first()).toEqual({ count: 0 });
    expect((await bucket.list()).objects).toHaveLength(1);
    expect(await cleanupOrphanReceipts({ DB: db, RECEIPTS_BUCKET: bucket }, admin, new Date("2030-01-01T00:00:00Z"))).toEqual({ deleted: 1 });
    expect((await bucket.list()).objects).toHaveLength(0);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_guards").first()).toEqual({ count: 0 });
  });

  it("allows only one cleanup job per receipt while storage deletion is in progress", async () => {
    await uploadReceipt({ DB: db, RECEIPTS_BUCKET: bucket }, worker, upload());
    let release!: () => void;
    let entered!: () => void;
    const permission = new Promise<void>((resolve) => { release = resolve; });
    const deletionStarted = new Promise<void>((resolve) => { entered = resolve; });
    let calls = 0;
    const blockedBucket = {
      head: (key: string) => bucket.head(key),
      async delete(key: string) { calls++; if (calls === 1) { entered(); await permission; } await bucket.delete(key); },
    } as unknown as R2Bucket;
    const env = { DB: db, RECEIPTS_BUCKET: blockedBucket };
    const first = cleanupOrphanReceipts(env, admin, new Date("2030-01-01T00:00:00Z"));
    await deletionStarted;
    const second = await cleanupOrphanReceipts(env, admin, new Date("2030-01-01T00:00:00Z"));
    release();
    await first;
    expect(second).toEqual({ deleted: 0 });
    expect(calls).toBe(1);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM operation_guards").first()).toEqual({ count: 0 });
  });

  it("cleans interrupted incident photo uploads after 48 hours", async () => {
    const incidentId = crypto.randomUUID();
    const key = `incidents/${worker.userId}/${incidentId}/orphan.webp`;
    await bucket.put(key, webp, { httpMetadata: { contentType: "image/webp" } });
    await db.prepare("INSERT INTO audit_events(id,actor_id,action,entity_id,reason,next_json,created_at) VALUES(?,?,'INCIDENT_UPLOAD_STARTED',?,'Inicio de foto privada',?,'2020-01-01 00:00:00')").bind(crypto.randomUUID(), worker.userId, incidentId, JSON.stringify({ r2_key: key })).run();
    expect(await cleanupOrphanReceipts({ DB: db, RECEIPTS_BUCKET: bucket }, admin)).toEqual({ deleted: 1 });
    expect(await bucket.head(key)).toBeNull();
  });

  it("preserves every proof linked to a reported incident during orphan cleanup", async () => {
    const incidentId = crypto.randomUUID();
    const key = `incidents/${worker.userId}/${incidentId}/linked.webp`;
    await bucket.put(key, webp, { httpMetadata: { contentType: "image/webp" } });
    await db.prepare("INSERT INTO audit_events(id,actor_id,action,entity_id,reason,next_json,created_at) VALUES(?,?,'INCIDENT_UPLOAD_STARTED',?,'Inicio de foto privada',?,'2020-01-01 00:00:00')").bind(crypto.randomUUID(), worker.userId, incidentId, JSON.stringify({ r2_key: key })).run();
    await db.prepare("INSERT INTO operation_incidents(id,worker_user_id,client_id,dispatch_id,payload_json,payload_hash,file_hash,receipt_r2_key) VALUES(?,?,'client-demo-01',?,?, 'request-hash','file-hash',?)").bind(incidentId, worker.userId, dispatch, JSON.stringify(visit({ idempotency_key: incidentId })), key).run();
    expect(await cleanupOrphanReceipts({ DB: db, RECEIPTS_BUCKET: bucket }, admin)).toEqual({ deleted: 0 });
    expect(await bucket.head(key)).not.toBeNull();
  });

  it("prevents replace from discarding the identity of an associated receipt", async () => {
    const env = { DB: db, RECEIPTS_BUCKET: bucket };
    const receipt = await uploadReceipt(env, worker, upload());
    await registerVisit(db, worker, visit({ payment_method: "TRANSFER", receipt_id: receipt.receipt_id }));
    await expect(db.prepare("INSERT OR REPLACE INTO receipts(id,owner_user_id,client_id,dispatch_id,r2_key,file_hash,byte_size,width,height) SELECT id,owner_user_id,client_id,dispatch_id,r2_key,file_hash,byte_size,width,height FROM receipts WHERE id = ?").bind(receipt.receipt_id).run()).rejects.toThrow(/RECEIPT_ID_ALREADY_EXISTS/);
    expect((await readReceipt(env, worker, receipt.receipt_id)).status).toBe(200);
  });
});

describe("worker client consultation directory", () => {
  it("returns ordered active clients without an assigned route and only consultation fields", async () => {
    await db.prepare("DELETE FROM dispatch_workers WHERE worker_user_id = ?").bind(worker.userId).run();
    const result = await readWorkerClients(db, worker);
    expect(Object.keys(result)).toEqual(["clients"]);
    expect(result.clients.map((client) => client.route_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.clients[0]).toEqual({ id: "client-demo-01", name: "Cliente de prueba 01", address: "Calle de prueba 1 # 1-01", address_reference: "Reja verde, primer piso", route_order: 1, current_balance: 65000 });
    for (const client of result.clients) expect(Object.keys(client).sort()).toEqual(["address", "address_reference", "current_balance", "id", "name", "route_order"]);
  });

  it("excludes inactive cards and preserves a balance in the client's favor", async () => {
    await db.prepare("UPDATE clients SET is_active = 0 WHERE id = 'client-demo-02'").run();
    const result = await readWorkerClients(db, worker);
    expect(result.clients.map((client) => client.route_order)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.clients.at(-1)).toMatchObject({ id: "client-demo-10", current_balance: -5000 });
  });

  it.each(["ADMIN", "CLIENT"] as const)("rejects %s access", async (role) => {
    await expect(readWorkerClients(db, { ...worker, role })).rejects.toMatchObject({ status: 403, code: "WORKER_REQUIRED" });
  });

  it("rejects a suspended worker even with a previously valid principal", async () => {
    await db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").bind(worker.userId).run();
    await expect(readWorkerClients(db, worker)).rejects.toMatchObject({ status: 403, code: "WORKER_REQUIRED" });
  });
});

describe("shared route directory and worker summary", () => {
  it("orders active cards, shares remaining stock and reports which colleague attended", async () => {
    await registerVisit(db, worker2, visit());
    const route = await readRoute(db, worker, dispatch) as { clients: { id: string; route_order: number; visited_by: string; visits_count: number }[]; inventory: { id: string; remaining_qty: number }[] };
    expect(route.clients.map((client) => client.route_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(route.clients[0]).toMatchObject({ id: "client-demo-01", visited_by: "Trabajador de prueba 2", visits_count: 1 });
    expect(route.inventory[0]).toBeDefined();
    expect(route.inventory.find((item) => item.id === "product-demo-1")).toMatchObject({ remaining_qty: 28 });
    expect(JSON.stringify(route)).not.toMatch(/cost_price|firebase_uid|request_hash/);
    const detail = await readRouteClient(db, worker, "client-demo-01", dispatch);
    expect(detail.client).toMatchObject({ revision: 1 });
    expect(detail).toMatchObject({ dispatch_status: "OPEN" });
    expect(detail.history.map((movement) => movement.movement_type)).toEqual(["VISIT", "OPENING"]);
  });

  it("requires an explicit selection when more than one open route is assigned", async () => {
    await db.batch([
      db.prepare("INSERT INTO route_dispatches(id, name, dispatch_date) VALUES ('second-route', 'Segundo recorrido', '2026-10-16')"),
      db.prepare("INSERT INTO dispatch_workers(dispatch_id, worker_user_id) VALUES ('second-route', ?)").bind(worker.userId),
    ]);
    expect(await readRoute(db, worker)).toMatchObject({ clients: [], inventory: [] });
    await expect(readRouteClient(db, worker, "client-demo-01", "second-unassigned-route")).rejects.toMatchObject({ status: 403 });
  });

  it("assigns two simultaneous new cards unique consecutive positions and audits both", async () => {
    const body = { name: "Nueva tarjeta", address: "Calle de prueba", address_reference: "Reja azul" };
    const created = await Promise.all([createRouteClient(db, worker, body), createRouteClient(db, worker2, { ...body, name: "Otra tarjeta" })]) as { client: { route_order: number } }[];
    expect(created.map((row) => row.client.route_order).sort()).toEqual([11, 12]);
    expect(await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'CLIENT_CREATED'").first()).toEqual({ count: 2 });
    await expect(createRouteClient(db, worker, { ...body, address_reference: "" })).rejects.toMatchObject({ status: 400 });
    await expect(createRouteClient(db, worker, { ...body, phone: "123" })).rejects.toMatchObject({ status: 400 });
  });

  it("keeps cash per worker, shared leftovers and the manual synchronization declaration", async () => {
    await registerVisit(db, worker2, visit());
    await registerVisit(db, worker, visit({ client_id: "client-demo-02", expected_balance: 42000, payment_amount: 7000, items: [] }));
    expect(await readRouteSummary(db, worker, dispatch)).toMatchObject({ cash_total: 7000, transfer_total: 0, transfer_count: 0, sync_confirmed: false });
    expect(await readRouteSummary(db, worker2, dispatch)).toMatchObject({ cash_total: 10000 });
    await confirmSynchronized(db, worker, dispatch);
    expect(await readRouteSummary(db, worker, dispatch)).toMatchObject({ sync_confirmed: true });
    await registerVisit(db, worker, visit({ expected_revision: 1, payment_amount: 0, payment_method: "NONE", items: [] }));
    expect(await readRouteSummary(db, worker, dispatch)).toMatchObject({ sync_confirmed: false });
  });
});
