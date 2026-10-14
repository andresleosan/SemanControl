import "server-only";
import type { Principal } from "../auth/types";
import { ApiError } from "../security/errors";
import { assertAssignment, assertWorker, clearGuards, digest, guard, identifier, uuid } from "./core";

export type ReceiptEnvironment = Pick<CloudflareEnv, "DB" | "RECEIPTS_BUCKET">;
export interface ReceiptUpload { receipt_id: unknown; client_id: unknown; dispatch_id: unknown; file: Blob }
export async function readReceiptForm(request: Request): Promise<ReceiptUpload> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("multipart/form-data;")) throw new ApiError(400, "INVALID_UPLOAD", "Envía el archivo WebP con los datos de su visita.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_UPLOAD", "Envía el archivo del comprobante.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 553000) { await reader.cancel(); throw new ApiError(413, "RECEIPT_TOO_LARGE", "El comprobante debe pesar como máximo 500 KB."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type")! }, body: bytes }).formData(); }
  catch { throw new ApiError(400, "INVALID_UPLOAD", "Los datos del comprobante no son válidos."); }
  const fields = ["receipt_id", "client_id", "dispatch_id", "file"];
  if ([...form.keys()].some((key) => !fields.includes(key)) || fields.some((key) => form.getAll(key).length !== 1)) throw new ApiError(400, "INVALID_UPLOAD", "Revisa los datos del comprobante.");
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(400, "INVALID_UPLOAD", "Envía el archivo WebP del comprobante.");
  return { receipt_id: form.get("receipt_id"), client_id: form.get("client_id"), dispatch_id: form.get("dispatch_id"), file };
}
interface ReceiptRow { id: string; owner_user_id: string; client_id: string; dispatch_id: string; r2_key: string; file_hash: string; movement_id: string | null }
const RECEIPT_COLUMNS = "id, owner_user_id, client_id, dispatch_id, r2_key, file_hash, movement_id";
function invalidImage(): never { throw new ApiError(400, "INVALID_WEBP", "Envía una imagen WebP estática de hasta 1600 × 1600 píxeles."); }

// Validate RIFF boundaries and the dimensions of the actual VP8/VP8L image,
// including consistency with an extended VP8X canvas. Do not trust MIME alone.
export function inspectWebP(buffer: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const four = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
  if (bytes.length < 26 || four(0) !== "RIFF" || four(8) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) invalidImage();
  let dimensions: { width: number; height: number } | null = null;
  let canvas: { width: number; height: number } | null = null;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) invalidImage();
    const kind = four(offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end + (length % 2) > bytes.length || (length % 2 && bytes[end] !== 0)) invalidImage();
    if (kind === "ANIM" || kind === "ANMF") invalidImage();
    if (kind === "VP8X") {
      if (canvas || dimensions || offset !== 12 || length !== 10 || (bytes[start] & 0xc3) || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalidImage();
      canvas = { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
    } else if (kind === "VP8L") {
      if (dimensions || length < 6 || bytes[start] !== 0x2f) invalidImage();
      const bits = view.getUint32(start + 1, true);
      if ((bits >>> 29) !== 0) invalidImage();
      dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    } else if (kind === "VP8 ") {
      if (dimensions || length < 11 || (bytes[start] & 1) || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) invalidImage();
      const partition = (bytes[start] + bytes[start + 1] * 256 + bytes[start + 2] * 65536) >>> 5;
      if (partition > length - 10) invalidImage();
      dimensions = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
    } else if (!["ALPH", "ICCP", "EXIF", "XMP "].includes(kind)) invalidImage();
    offset = end + (length % 2);
  }
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 1600 || dimensions.height > 1600 || (canvas && (canvas.width !== dimensions.width || canvas.height !== dimensions.height))) invalidImage();
  return dimensions;
}

export async function uploadReceipt(env: ReceiptEnvironment, principal: Principal, input: ReceiptUpload): Promise<{ receipt_id: string }> {
  await assertWorker(env.DB, principal);
  const id = uuid(input.receipt_id);
  const clientId = identifier(input.client_id, "la tarjeta");
  const dispatchId = identifier(input.dispatch_id, "el recorrido");
  if (!input.file || input.file.type !== "image/webp" || input.file.size < 1) invalidImage();
  if (input.file.size > 512000) throw new ApiError(413, "RECEIPT_TOO_LARGE", "El comprobante debe pesar como máximo 500 KB.");
  const content = await input.file.arrayBuffer();
  const dimensions = inspectWebP(content);
  const hash = await digest(content);
  const db = env.DB;
  async function existing() { return db.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id = ?`).bind(id).first<ReceiptRow>(); }
  function same(row: ReceiptRow) {
    if (row.owner_user_id !== principal.userId || row.client_id !== clientId || row.dispatch_id !== dispatchId || row.file_hash !== hash) {
      throw new ApiError(409, "RECEIPT_CONFLICT", "Esta clave de comprobante ya pertenece a otro archivo o visita.");
    }
    return { receipt_id: id };
  }
  const prior = await existing();
  if (prior) return same(prior);
  await assertAssignment(db, principal, dispatchId, true);
  if (!await db.prepare("SELECT id FROM clients WHERE id = ? AND is_active = 1").bind(clientId).first()) throw new ApiError(404, "CLIENT_NOT_FOUND", "La tarjeta no está activa.");
  // Different files racing on the same UUID cannot overwrite one another.
  const key = `receipts/${principal.userId}/${id}/${hash}.webp`;
  const objectLock = `receipt-object-cleanup:${key}`;
  const startingGuard = crypto.randomUUID();
  // Record the object before writing it so a crash between R2 and D1 can be
  // recovered by manual maintenance. A recent attempt also shields retries.
  try {
    await db.batch([
      guard(db, startingGuard, "NOT EXISTS (SELECT 1 FROM operation_guards WHERE id IN (?, ?)) AND EXISTS (SELECT 1 FROM users u JOIN dispatch_workers w ON w.worker_user_id = u.id JOIN route_dispatches d ON d.id = w.dispatch_id JOIN clients c ON c.id = ? WHERE u.id = ? AND u.role = 'WORKER' AND u.is_active = 1 AND d.id = ? AND d.status = 'OPEN' AND c.is_active = 1)", [`receipt-cleanup:${id}`, objectLock, clientId, principal.userId, dispatchId]),
      db.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason, next_json) VALUES (?, ?, 'RECEIPT_UPLOAD_STARTED', ?, 'Inicio de carga privada de comprobante', ?)").bind(crypto.randomUUID(), principal.userId, id, JSON.stringify({ r2_key: key })),
      clearGuards(db, [startingGuard]),
    ]);
  } catch (error) {
    if (/constraint/i.test(String(error))) throw new ApiError(409, "RECEIPT_CONFLICT", "El recorrido o la tarjeta cambió, o el comprobante está en limpieza. Conserva el archivo para revisión.");
    throw error;
  }
  await env.RECEIPTS_BUCKET.put(key, content, { httpMetadata: { contentType: "image/webp" } });
  const guardId = crypto.randomUUID();
  try {
    await db.batch([
      guard(db, guardId, "NOT EXISTS (SELECT 1 FROM operation_guards WHERE id IN (?, ?)) AND EXISTS (SELECT 1 FROM users u JOIN dispatch_workers w ON w.worker_user_id = u.id JOIN route_dispatches d ON d.id = w.dispatch_id JOIN clients c ON c.id = ? WHERE u.id = ? AND u.role = 'WORKER' AND u.is_active = 1 AND d.id = ? AND d.status = 'OPEN' AND c.is_active = 1)", [`receipt-cleanup:${id}`, objectLock, clientId, principal.userId, dispatchId]),
      db.prepare("INSERT INTO receipts(id, owner_user_id, client_id, dispatch_id, r2_key, file_hash, byte_size, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, principal.userId, clientId, dispatchId, key, hash, input.file.size, dimensions.width, dimensions.height),
      clearGuards(db, [guardId]),
    ]);
    return { receipt_id: id };
  } catch (error) {
    const row = await existing();
    // Delete only this failed upload's private object; keep a racing winner.
    if (!row || row.r2_key !== key) await env.RECEIPTS_BUCKET.delete(key);
    if (row) return same(row);
    if (/constraint|RECEIPT_ID_ALREADY_EXISTS/i.test(String(error))) throw new ApiError(409, "RECEIPT_CONFLICT", "El recorrido o la tarjeta cambió; conserva el comprobante para revisión.");
    throw error;
  }
}

async function assertAdmin(db: D1Database, principal: Principal) {
  if (principal.role !== "ADMIN" || !await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'ADMIN' AND is_active = 1").bind(principal.userId).first()) throw new ApiError(403, "ADMIN_REQUIRED", "Esta operación requiere un administrador activo.");
}
export async function readReceipt(env: ReceiptEnvironment, principal: Principal, id: string): Promise<Response> {
  const receipt = await env.DB.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id = ?`).bind(uuid(id)).first<ReceiptRow>();
  if (!receipt) throw new ApiError(404, "RECEIPT_NOT_FOUND", "No se encontró el comprobante.");
  if (principal.role === "ADMIN") await assertAdmin(env.DB, principal);
  else if (principal.role === "WORKER") {
    await assertAssignment(env.DB, principal, receipt.dispatch_id);
    if (receipt.owner_user_id !== principal.userId) throw new ApiError(403, "RECEIPT_FORBIDDEN", "No tienes acceso a este comprobante.");
  } else if (!receipt.movement_id || receipt.client_id !== principal.clientId || !await env.DB.prepare("SELECT id FROM clients WHERE id = ? AND firebase_uid = ? AND is_active = 1").bind(principal.clientId, principal.firebaseUid).first()) {
    throw new ApiError(403, "RECEIPT_FORBIDDEN", "No tienes acceso a este comprobante.");
  }
  const object = await env.RECEIPTS_BUCKET.get(receipt.r2_key);
  if (!object) throw new ApiError(404, "RECEIPT_NOT_FOUND", "No se encontró el archivo del comprobante.");
  return new Response(object.body, { headers: { "Content-Type": "image/webp", "Content-Disposition": `inline; filename="${receipt.id}.webp"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

// Maintenance is manual and ADMIN-only. A persistent cleanup lock forbids
// association while R2 deletion is in progress. Storage failures leave enough
// metadata to resume safely; the final D1 batch removes metadata and the lock.
export async function cleanupOrphanReceipts(env: ReceiptEnvironment, principal: Principal, now = new Date()): Promise<{ deleted: number }> {
  await assertAdmin(env.DB, principal);
  if (!Number.isFinite(now.getTime())) throw new ApiError(400, "INVALID_DATE", "La fecha de limpieza no es válida.");
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const candidates = await env.DB.prepare("SELECT id, r2_key FROM receipts WHERE movement_id IS NULL AND created_at < ?").bind(cutoff).all<{ id: string; r2_key: string }>();
  let deleted = 0;
  for (const candidate of candidates.results) {
    const lock = `receipt-cleanup:${candidate.id}`;
    const job = `${lock}:job`;
    const validation = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO operation_guards(id, ok) VALUES (?, 1) ON CONFLICT(id) DO NOTHING").bind(lock),
        guard(env.DB, validation, "NOT EXISTS (SELECT 1 FROM operation_guards WHERE id = ?) AND EXISTS (SELECT 1 FROM receipts WHERE id = ? AND movement_id IS NULL AND created_at < ?) AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'ADMIN' AND is_active = 1)", [job, candidate.id, cutoff, principal.userId]),
        env.DB.prepare("INSERT INTO operation_guards(id, ok) VALUES (?, 1)").bind(job),
        clearGuards(env.DB, [validation]),
      ]);
    } catch (error) {
      // Association or a different cleanup may have won after listing.
      if (/CHECK constraint/i.test(String(error))) continue;
      throw error;
    }
    try {
      await env.RECEIPTS_BUCKET.delete(candidate.r2_key);
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason) SELECT ?, ?, 'ORPHAN_RECEIPT_CLEANUP', id, 'Comprobante sin asociar durante más de 48 horas' FROM receipts WHERE id = ? AND movement_id IS NULL AND created_at < ?").bind(crypto.randomUUID(), principal.userId, candidate.id, cutoff),
        env.DB.prepare("DELETE FROM receipts WHERE id = ? AND movement_id IS NULL AND created_at < ? RETURNING id").bind(candidate.id, cutoff),
        clearGuards(env.DB, [lock, job]),
      ]);
      deleted += results[1].results.length;
    } catch (error) {
      await clearGuards(env.DB, [job]).run();
      throw error;
    }
  }
  // Upload attempts without metadata can remain after interruption or storage
  // failure. The key lock prevents a concurrent retry from republishing it.
  const interrupted = await env.DB.prepare("SELECT a.id, a.entity_id, json_extract(a.next_json, '$.r2_key') AS r2_key FROM audit_events a WHERE a.action IN ('RECEIPT_UPLOAD_STARTED','INCIDENT_UPLOAD_STARTED') AND a.created_at < ? AND NOT EXISTS (SELECT 1 FROM audit_events done WHERE done.action = 'ORPHAN_RECEIPT_OBJECT_CLEANUP' AND json_extract(done.next_json, '$.upload_event_id') = a.id) AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.r2_key = json_extract(a.next_json, '$.r2_key')) AND NOT EXISTS (SELECT 1 FROM operation_incidents i WHERE i.receipt_r2_key = json_extract(a.next_json, '$.r2_key'))").bind(cutoff).all<{ id: string; entity_id: string; r2_key: string }>();
  for (const candidate of interrupted.results) {
    const lock = `receipt-object-cleanup:${candidate.r2_key}`;
    const job = `${lock}:job`;
    const validation = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO operation_guards(id, ok) VALUES (?, 1) ON CONFLICT(id) DO NOTHING").bind(lock),
        guard(env.DB, validation, "NOT EXISTS (SELECT 1 FROM operation_guards WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM receipts WHERE r2_key = ?) AND NOT EXISTS (SELECT 1 FROM ledger_movements WHERE receipt_r2_key = ?) AND NOT EXISTS (SELECT 1 FROM operation_incidents WHERE receipt_r2_key = ?) AND NOT EXISTS (SELECT 1 FROM audit_events WHERE action IN ('RECEIPT_UPLOAD_STARTED','INCIDENT_UPLOAD_STARTED') AND entity_id = ? AND created_at >= ?) AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'ADMIN' AND is_active = 1)", [job, candidate.r2_key, candidate.r2_key, candidate.r2_key, candidate.entity_id, cutoff, principal.userId]),
        env.DB.prepare("INSERT INTO operation_guards(id, ok) VALUES (?, 1)").bind(job),
        clearGuards(env.DB, [validation]),
      ]);
    } catch (error) {
      if (/CHECK constraint/i.test(String(error))) continue;
      throw error;
    }
    try {
      const exists = !!await env.RECEIPTS_BUCKET.head(candidate.r2_key);
      if (exists) await env.RECEIPTS_BUCKET.delete(candidate.r2_key);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO audit_events(id, actor_id, action, entity_id, reason, next_json) VALUES (?, ?, 'ORPHAN_RECEIPT_OBJECT_CLEANUP', ?, 'Objeto de comprobante sin asociación durante más de 48 horas', ?)").bind(crypto.randomUUID(), principal.userId, candidate.entity_id, JSON.stringify({ upload_event_id: candidate.id })),
        clearGuards(env.DB, [lock, job]),
      ]);
      if (exists) deleted++;
    } catch (error) {
      await clearGuards(env.DB, [job]).run();
      throw error;
    }
  }
  return { deleted };
}
