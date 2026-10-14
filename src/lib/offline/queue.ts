export interface VisitPayload {
  idempotency_key: string; dispatch_id: string; client_id: string;
  expected_revision: number; expected_balance: number; payment_amount: number;
  payment_method: "NONE" | "CASH" | "TRANSFER";
  receipt_id?: string | null;
  items: { product_id: string; qty: number; unit_credit_price: number }[];
}
export interface QueueRecord {
  key: string; uid: string; dispatch_id: string; payload: VisitPayload; photo?: Blob;
  state: "pending" | "conflict" | "registered"; created_at: string;
  error?: string; movement_id?: string; uploaded?: boolean; resolved_by?: string; reported_incident?: string;
}
export interface QueueStore {
  list(uid: string, dispatch: string): Promise<QueueRecord[]>;
  put(row: QueueRecord): Promise<void>;
  /** Atomically append one replacement and link its still-unresolved conflict. */
  resolve(original: QueueRecord, replacement: QueueRecord): Promise<boolean>;
}
export interface QueueTransport {
  visit(payload: VisitPayload): Promise<{ movement: { id: string }; replayed?: boolean }>;
  upload?(row: QueueRecord): Promise<void>;
}
export interface IncidentAcknowledgement { incident_id?: string; already_registered?: boolean; movement_id?: string }
export class OfflineQueue {
  private running = new Map<string, Promise<void>>();
  constructor(private store: QueueStore) {}
  private createRecord(uid: string, payload: VisitPayload, photo?: Blob): QueueRecord {
    if (!uid || !payload.dispatch_id) throw new Error("Selecciona tu cuenta y recorrido.");
    if (payload.payment_method === "TRANSFER" && (!photo || !payload.receipt_id)) throw new Error("Conserva la foto de la transferencia antes de guardar.");
    return { key: JSON.stringify([uid, payload.dispatch_id, payload.idempotency_key]), uid, dispatch_id: payload.dispatch_id, payload: structuredClone(payload), photo, state: "pending", created_at: new Date().toISOString() };
  }
  async enqueue(uid: string, payload: VisitPayload, photo?: Blob): Promise<QueueRecord> {
    const row = this.createRecord(uid, payload, photo);
    const existing = (await this.list(uid, payload.dispatch_id)).find((candidate) => candidate.key === row.key);
    if (existing) {
      if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) throw new Error("Esta operación ya existe con otros valores.");
      return existing;
    }
    await this.store.put(row);
    return structuredClone(row);
  }
  async list(uid: string, dispatch: string) {
    return (await this.store.list(uid, dispatch)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async replay(uid: string, dispatch: string, transport: QueueTransport): Promise<void> {
    const scope = JSON.stringify([uid, dispatch]);
    const existing = this.running.get(scope);
    if (existing) return existing;
    const work = async () => {
      for (const row of await this.list(uid, dispatch)) {
        if (row.state !== "pending" || row.resolved_by) continue;
        try {
          if (row.photo && !row.uploaded) {
            if (!transport.upload) throw new Error("No se puede subir el comprobante.");
            await transport.upload(structuredClone(row));
            row.uploaded = true;
            await this.store.put(row);
          }
          const result = await transport.visit(structuredClone(row.payload));
          if (!result.movement?.id) throw new Error("El servidor no confirmó la visita. Conservamos el pendiente.");
          row.state = "registered";
          row.movement_id = result.movement.id;
          row.error = undefined;
          await this.store.put(row);
        } catch (error) {
          const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
          row.error = error instanceof Error ? error.message : "No pudimos sincronizar. La visita está conservada.";
          if ([400, 403, 404, 409, 413, 422].includes(status)) row.state = "conflict";
          await this.store.put(row);
          if (row.state === "pending") break;
        }
      }
    };
    const locked = typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`semancontrol-sync-${scope}`, work)
      : work();
    const task = Promise.resolve(locked).then(() => undefined);
    this.running.set(scope, task);
    try { await task; } finally { this.running.delete(scope); }
  }
  async hasUnresolved(uid: string, dispatch: string): Promise<boolean> {
    const rows = await this.list(uid, dispatch);
    const settled = (row: QueueRecord, seen = new Set<string>()): boolean => {
      if (row.state === "registered") return true;
      if (!row.resolved_by || seen.has(row.key)) return false;
      seen.add(row.key);
      const next = rows.find((candidate) => candidate.key === row.resolved_by);
      return !!next && settled(next, seen);
    };
    return rows.some((row) => !settled(row));
  }
  async reconfirm(uid: string, dispatch: string, key: string, fresh: { revision: number; balance: number; prices: Record<string, number> }): Promise<QueueRecord> {
    const original = (await this.list(uid, dispatch)).find((row) => row.key === key);
    if (!original || original.state !== "conflict" || original.resolved_by) throw new Error("La incidencia ya tiene una confirmación o pertenece a otra cuenta.");
    const items = original.payload.items.map((item) => {
      const price = fresh.prices[item.product_id];
      if (!Number.isSafeInteger(price) || price < 0) throw new Error("Revisa los productos con el administrador.");
      return { ...item, unit_credit_price: price };
    });
    const next = this.createRecord(uid, { ...original.payload, idempotency_key: crypto.randomUUID(), expected_revision: fresh.revision, expected_balance: fresh.balance, items }, original.photo);
    // Keep the original physical operation and its conflict immutable. The link
    // only settles the incident when the replacement is acknowledged by server.
    if (!(await this.store.resolve(original, next))) throw new Error("Esta incidencia ya fue confirmada en otra vista. Actualiza los pendientes.");
    return next;
  }
  async report(uid: string, dispatch: string, key: string, send: (row: QueueRecord) => Promise<IncidentAcknowledgement>): Promise<QueueRecord> {
    const row = (await this.list(uid, dispatch)).find((candidate) => candidate.key === key);
    if (!row || row.state !== "conflict" || row.resolved_by) throw new Error("Esta incidencia ya está confirmada o pertenece a otra cuenta.");
    if (row.reported_incident) return row;
    const response = await send(structuredClone(row));
    if (response.already_registered && response.movement_id) {
      row.state = "registered"; row.movement_id = response.movement_id; row.error = undefined;
    } else if (response.incident_id) row.reported_incident = response.incident_id;
    else throw new Error("El servidor no confirmó la recepción de la incidencia. Conservamos el original.");
    await this.store.put(row);
    return row;
  }
}
