import { describe, expect, it } from "vitest";
import { OfflineQueue, type QueueRecord, type QueueStore, type VisitPayload } from "@/lib/offline/queue";

class DurableMemoryStore implements QueueStore {
  rows = new Map<string, QueueRecord>();
  async list(uid: string, dispatch: string) {
    return structuredClone([...this.rows.values()].filter((row) => row.uid === uid && row.dispatch_id === dispatch));
  }
  async put(row: QueueRecord) { this.rows.set(row.key, structuredClone(row)); }
  async resolve(original: QueueRecord, replacement: QueueRecord) {
    const latest = this.rows.get(original.key);
    if (!latest || latest.state !== "conflict" || latest.resolved_by) return false;
    this.rows.set(replacement.key, structuredClone(replacement));
    this.rows.set(original.key, structuredClone({ ...latest, resolved_by: replacement.key }));
    return true;
  }
}
const payload = (): VisitPayload => ({
  idempotency_key: crypto.randomUUID(), dispatch_id: "route", client_id: "card", expected_revision: 2,
  expected_balance: 40000, payment_amount: 10000, payment_method: "CASH",
  items: [{ product_id: "product", qty: 2, unit_credit_price: 3000 }],
});
const issue = (status: number, message: string) => Object.assign(new Error(message), { status });

describe("private durable visit queue", () => {
  it("retries the exact operation after a lost response, without a second charge", async () => {
    const store = new DurableMemoryStore(), queue = new OfflineQueue(store);
    const operation = payload();
    await queue.enqueue("worker-a", operation);
    const committed = new Map<string, VisitPayload>();
    let chargeCount = 0, loseResponse = true;
    const transport = {
      async visit(body: VisitPayload) {
        if (!committed.has(body.idempotency_key)) { committed.set(body.idempotency_key, structuredClone(body)); chargeCount++; }
        if (loseResponse) { loseResponse = false; throw new TypeError("Connection lost"); }
        return { movement: { id: "movement" }, replayed: true };
      },
    };
    await queue.replay("worker-a", "route", transport);
    expect((await queue.list("worker-a", "route"))[0].state).toBe("pending");
    operation.payment_amount = 999;
    await queue.replay("worker-a", "route", transport);
    expect(chargeCount).toBe(1);
    expect([...committed.values()][0].payment_amount).toBe(10000);
    expect((await queue.list("worker-a", "route"))[0].state).toBe("registered");
  });

  it("isolates users and dispatches even when they share the same phone", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    await queue.enqueue("worker-a", payload());
    await queue.enqueue("worker-b", { ...payload(), dispatch_id: "other-route" });
    const sent: VisitPayload[] = [];
    await queue.replay("worker-b", "route", { async visit(body) { sent.push(body); return { movement: { id: "m" } }; } });
    expect(sent).toEqual([]);
    expect(await queue.list("worker-b", "route")).toEqual([]);
    expect((await queue.list("worker-a", "route"))[0].state).toBe("pending");
  });

  it("preserves physical payment and original conflict; only explicit reconfirmation updates server observations", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    const original = await queue.enqueue("worker-a", payload());
    let calls = 0;
    const transport = { async visit() { calls++; throw issue(409, "El saldo cambió"); } };
    await queue.replay("worker-a", "route", transport);
    await queue.replay("worker-a", "route", transport);
    expect(calls).toBe(1);
    const replacement = await queue.reconfirm("worker-a", "route", original.key, {
      revision: 3, balance: 35000, prices: { product: 3500 },
    });
    expect(replacement.payload.idempotency_key).not.toBe(original.payload.idempotency_key);
    expect(replacement.payload.payment_amount).toBe(10000);
    expect(replacement.payload.items[0]).toEqual({ product_id: "product", qty: 2, unit_credit_price: 3500 });
    const rows = await queue.list("worker-a", "route");
    expect(rows.find((row) => row.key === original.key)?.payload).toEqual(original.payload);
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(true);
    await queue.replay("worker-a", "route", { async visit() { return { movement: { id: "m" } }; } });
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(false);
    expect((await queue.list("worker-a", "route")).find((row) => row.key === original.key)?.state).toBe("conflict");
  });

  it("retains a late closed-dispatch operation as an incident rather than discarding money", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    await queue.enqueue("worker-a", payload());
    await queue.replay("worker-a", "route", { async visit() { throw issue(403, "Recorrido cerrado"); } });
    const [row] = await queue.list("worker-a", "route");
    expect(row.state).toBe("conflict");
    expect(row.error).toBe("Recorrido cerrado");
    expect(row.payload.payment_amount).toBe(10000);
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(true);
  });

  it("allows exactly one replacement when two open views reconfirm the same physical payment", async () => {
    const store = new DurableMemoryStore(), first = new OfflineQueue(store), second = new OfflineQueue(store);
    const original = await first.enqueue("worker-a", payload());
    await first.replay("worker-a", "route", { async visit() { throw issue(409, "Cambió saldo"); } });
    const fresh = { revision: 3, balance: 30000, prices: { product: 3000 } };
    const results = await Promise.allSettled([first.reconfirm("worker-a", "route", original.key, fresh), second.reconfirm("worker-a", "route", original.key, fresh)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await first.list("worker-a", "route")).filter((row) => row.state === "pending")).toHaveLength(1);
  });

  it("keeps authentication failure pending and never claims registration locally", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    await queue.enqueue("worker-a", payload());
    await queue.replay("worker-a", "route", { async visit() { throw issue(401, "Inicia sesión"); } });
    expect((await queue.list("worker-a", "route"))[0].state).toBe("pending");
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(true);
  });

  it("reports a closed-route incident with original physical proof without claiming registration", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    const body = { ...payload(), payment_method: "TRANSFER" as const, receipt_id: crypto.randomUUID() };
    const photo = new Blob(["proof"], { type: "image/webp" });
    const original = await queue.enqueue("worker-a", body, photo);
    await queue.replay("worker-a", "route", { async upload() { throw issue(403, "Cerrado"); }, async visit() { throw new Error("must not reach visit"); } });
    const sent: QueueRecord[] = [];
    await queue.report("worker-a", "route", original.key, async (row) => { sent.push(row); return { incident_id: "incident" }; });
    const [saved] = await queue.list("worker-a", "route");
    expect(sent[0].payload).toEqual(body);
    expect(await sent[0].photo!.text()).toBe("proof");
    expect(saved.payload).toEqual(body);
    expect(saved.state).toBe("conflict");
    expect(saved.reported_incident).toBe("incident");
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(true);
  });

  it("settles a late lost-response visit only when the incident server proves it was already registered", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    const row = await queue.enqueue("worker-a", payload());
    await queue.replay("worker-a", "route", { async visit() { throw issue(403, "Cerrado"); } });
    await queue.report("worker-a", "route", row.key, async () => ({ already_registered: true, movement_id: "existing-movement" }));
    const [saved] = await queue.list("worker-a", "route");
    expect(saved.state).toBe("registered");
    expect(saved.movement_id).toBe("existing-movement");
    expect(await queue.hasUnresolved("worker-a", "route")).toBe(false);
  });

  it("retries the same receipt and UUID when upload response disappears", async () => {
    const queue = new OfflineQueue(new DurableMemoryStore());
    const body = { ...payload(), payment_method: "TRANSFER" as const, receipt_id: crypto.randomUUID() };
    const photo = new Blob(["webp-physical-proof"], { type: "image/webp" });
    await queue.enqueue("worker-a", body, photo);
    const receiptIds: string[] = [], receiptBytes: string[] = [];
    let lose = true;
    const transport = {
      async upload(row: QueueRecord) {
        receiptIds.push(row.payload.receipt_id!); receiptBytes.push(await row.photo!.text());
        if (lose) { lose = false; throw new TypeError("Lost response"); }
      },
      async visit() { return { movement: { id: "m" } }; },
    };
    await queue.replay("worker-a", "route", transport);
    await queue.replay("worker-a", "route", transport);
    expect(receiptIds).toEqual([body.receipt_id, body.receipt_id]);
    expect(receiptBytes).toEqual(["webp-physical-proof", "webp-physical-proof"]);
    expect((await queue.list("worker-a", "route"))[0].state).toBe("registered");
  });
});
