import { afterAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { reportIncident } from "../src/lib/incidents";

let mf: Miniflare | undefined;
afterAll(async () => { await mf?.dispose(); });

it("retains only the winning private incident image when UUID uploads race", async () => {
    mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('ok')}}", compatibilityDate: "2026-10-14", d1Databases: ["DB"], r2Buckets: ["RECEIPTS_BUCKET"] }));
    const db = await mf.getD1Database("DB") as unknown as D1Database;
    const bucket = await mf.getR2Bucket("RECEIPTS_BUCKET") as unknown as R2Bucket;
    for (const file of ["migrations/0001_init.sql", "migrations/0002_operations.sql", "migrations/0003_incidents.sql", "migrations/0004_product_categories.sql", "migrations/0005_opening_items.sql", "seed.sql"]) {
      let statement = "", trigger = false;
      for (const line of (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).split("\n")) {
        if (!statement && (!line.trim() || line.trim().startsWith("--"))) continue;
        statement += line + "\n";
        if (/CREATE TRIGGER/i.test(statement)) trigger = true;
        if ((!trigger && /;\s*$/.test(line)) || (trigger && /^END;\s*$/i.test(line.trim()))) { await db.prepare(statement).run(); statement = ""; trigger = false; }
      }
    }
    await db.prepare("UPDATE route_dispatches SET status='CLOSED' WHERE id='route-demo-2026-10-16'").run();
    const bytes = new Uint8Array(Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64"));
    const second = new Uint8Array(bytes.length + 12); second.set(bytes); second.set([88, 77, 80, 32, 4, 0, 0, 0, 60, 120, 47, 62], bytes.length); new DataView(second.buffer).setUint32(4, second.length - 8, true);
    let writes = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const deadline = setTimeout(release, 5000);
    const gatedBucket = { async put(key: string, value: ArrayBuffer, options: R2PutOptions) { await bucket.put(key, value, options); if (++writes === 2) { clearTimeout(deadline); release(); } await barrier; if (writes !== 2) throw new Error("Both incident writes did not reach the race barrier."); }, delete: bucket.delete.bind(bucket) } as unknown as R2Bucket;
    const worker = { userId: "worker-demo-1", firebaseUid: "worker-uid-1", email: "trabajador1@semancontrol.example", name: "Worker", role: "WORKER" as const, clientId: null };
    const payload = { idempotency_key: crypto.randomUUID(), dispatch_id: "route-demo-2026-10-16", client_id: "client-demo-01", expected_revision: 0, expected_balance: 65000, payment_amount: 5000, payment_method: "TRANSFER", receipt_id: crypto.randomUUID(), items: [] };
    const results = await Promise.allSettled([
      reportIncident({ DB: db, RECEIPTS_BUCKET: gatedBucket }, worker, payload, new Blob([bytes], { type: "image/webp" })),
      reportIncident({ DB: db, RECEIPTS_BUCKET: gatedBucket }, worker, payload, new Blob([second], { type: "image/webp" })),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.prepare("SELECT COUNT(*) n FROM operation_incidents").first()).toEqual({ n: 1 });
    expect((await bucket.list()).objects).toHaveLength(1);
});
