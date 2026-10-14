import { OfflineQueue, type QueueRecord, type QueueStore } from "./queue";

interface LocalValue<T> { key: string; uid: string; value: T; observed_at: string }
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Este navegador no permite guardar pendientes. Activa el almacenamiento local.")); return; }
    const request = indexedDB.open("semancontrol-private-route", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const queue = db.createObjectStore("queue", { keyPath: "key" });
      queue.createIndex("owner_dispatch", ["uid", "dispatch_id"]);
      db.createObjectStore("snapshots", { keyPath: "key" });
      db.createObjectStore("drafts", { keyPath: "key" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(new Error("No pudimos abrir los pendientes guardados. No borres los datos del navegador.")); };
    request.onblocked = () => { database = undefined; reject(new Error("Cierra las otras pestañas para abrir los pendientes.")); };
  });
  return database;
}
async function write(storeName: string, value: unknown) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error("El teléfono no pudo conservar la visita. Revisa el espacio libre antes de continuar."));
  });
}
export const indexedQueueStore: QueueStore = {
  async list(uid, dispatch) {
    const db = await openDatabase();
    return new Promise<QueueRecord[]>((resolve, reject) => {
      const request = db.transaction("queue").objectStore("queue").index("owner_dispatch").getAll(IDBKeyRange.only([uid, dispatch]));
      request.onsuccess = () => resolve(request.result as QueueRecord[]);
      request.onerror = () => reject(new Error("No pudimos leer los pendientes del recorrido."));
    });
  },
  async put(row) { await write("queue", row); },
  async resolve(original, replacement) {
    const db = await openDatabase();
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite"), store = tx.objectStore("queue");
      let accepted = false;
      const lookup = store.get(original.key);
      lookup.onsuccess = () => {
        const latest = lookup.result as QueueRecord | undefined;
        if (!latest || latest.uid !== original.uid || latest.dispatch_id !== original.dispatch_id || latest.state !== "conflict" || latest.resolved_by) return;
        store.add(replacement);
        store.put({ ...latest, resolved_by: replacement.key });
        accepted = true;
      };
      tx.oncomplete = () => resolve(accepted);
      tx.onerror = tx.onabort = () => reject(new Error("No pudimos conservar la nueva confirmación. La incidencia original permanece guardada."));
    });
  },
};
export const routeQueue = new OfflineQueue(indexedQueueStore);
/** Closed routes with unsent physical operations remain discoverable on reopen. */
export async function queuedDispatches(uid: string): Promise<string[]> {
  if (!uid) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("queue").objectStore("queue").index("owner_dispatch").getAll(IDBKeyRange.bound([uid, ""], [uid, "\uffff"]));
    request.onsuccess = () => {
      const rows = request.result as QueueRecord[];
      resolve([...new Set(rows.filter((row) => row.uid === uid && row.state !== "registered" && !row.resolved_by).map((row) => row.dispatch_id))]);
    };
    request.onerror = () => reject(new Error("No pudimos localizar los recorridos con pendientes."));
  });
}
export async function saveLocal<T>(kind: "snapshots" | "drafts", uid: string, scope: string, value: T) {
  if (!uid) throw new Error("La cuenta debe estar identificada para conservar datos.");
  await write(kind, { key: JSON.stringify([uid, scope]), uid, value, observed_at: new Date().toISOString() });
}
export async function readLocal<T>(kind: "snapshots" | "drafts", uid: string, scope: string): Promise<LocalValue<T> | null> {
  if (!uid) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(kind).objectStore(kind).get(JSON.stringify([uid, scope]));
    request.onsuccess = () => resolve(request.result?.uid === uid ? request.result as LocalValue<T> : null);
    request.onerror = () => reject(new Error("No pudimos recuperar la información guardada."));
  });
}
export async function removeDraft(uid: string, scope: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").delete(JSON.stringify([uid, scope]));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("No pudimos actualizar el borrador."));
  });
}
