"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Copy, ExternalLink, FileImage, RefreshCw } from "lucide-react";
import { api, apiBlob, ClientApiError, useSession } from "@/lib/client-api";
import { AppShell, Badge, Money, Notice } from "@/components/ui";
import type { Role } from "@/lib/auth/types";
import { getFirebaseAuth } from "@/lib/auth/client";
import type { Movement } from "./_types";
import { OperationDrafts } from "./_form-model";
import { errorFallbackData, readableData, type ResourceRecord } from "./_resource-model";

type SessionAccess = ReturnType<typeof useSession> & { invalidate: (message: string) => void };
const PrivateSession = createContext<SessionAccess>({ user: null, loading: true, error: null, invalidate: () => {} });

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la operación. Intenta nuevamente.";
}

export function useResource<T>(path: string, enabled = true) {
  const session = useContext(PrivateSession);
  const expectedRole = path.startsWith("/api/admin/") ? "ADMIN" : path.startsWith("/api/mi-cuenta") ? "CLIENT" : null;
  const owner = session.user ? `${session.user.firebaseUid}:${session.user.role}:${session.user.clientId ?? ""}` : "";
  const allowed = Boolean(owner && (!expectedRole || expectedRole === session.user?.role));
  const canLoad = enabled && allowed && !session.loading;
  const invalidate = session.invalidate;
  const [epoch, setEpoch] = useState(0);
  const [record, setRecord] = useState<ResourceRecord<T> | null>(null);
  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setRecord({ owner, path, epoch, data, error: "" }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ClientApiError && [401, 403].includes(error.status)) invalidate(errorMessage(error));
        setRecord((previous) => ({ owner, path, epoch, data: errorFallbackData(error instanceof ClientApiError ? error.status : null, previous, owner, path), error: errorMessage(error) }));
      },
    );
    return () => controller.abort();
  }, [path, epoch, canLoad, owner, invalidate]);
  return {
    data: readableData(record, owner, path, canLoad),
    error: enabled && !session.loading && !allowed ? session.error ?? "Esta cuenta no tiene acceso a la información de esta pantalla." : record?.owner === owner && record.path === path ? record.error : "",
    loading: enabled && (session.loading || canLoad && (!record || record.owner !== owner || record.path !== path || record.epoch !== epoch)),
    refresh: () => setEpoch((value) => value + 1),
  };
}

export function RoleBoundary({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const owner = session.user ? `${session.user.firebaseUid}:${session.user.role}:${session.user.clientId ?? ""}` : "";
  const [denied, setDenied] = useState<{ owner: string; message: string } | null>(null);
  const invalidate = useCallback((message: string) => { setDenied({ owner, message }); }, [owner]);
  const value = useMemo(() => ({ ...session, invalidate }), [session, invalidate]);
  const blocked = Boolean(owner && denied?.owner === owner);
  if (!session.loading && session.user?.role === role && !blocked) return <PrivateSession.Provider value={value}><div key={owner}>{children}</div></PrivateSession.Provider>;
  return <AppShell role={role} title={role === "ADMIN" ? "Administración" : "Mi tarjeta digital"}><Notice tone={session.loading ? "info" : "error"}>{session.loading ? "Comprobando tu acceso…" : blocked ? denied?.message : session.error ?? "Esta cuenta no tiene acceso a esta pantalla."}</Notice>{!session.loading && <button type="button" className="sc-button sc-button-secondary" onClick={() => window.location.reload()}><RefreshCw size={18} aria-hidden /> Volver a comprobar el acceso</button>}</AppShell>;
}

export function useMutation() {
  const access = useContext(PrivateSession);
  const lock = useRef(false);
  const drafts = useRef(new OperationDrafts());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run<T>(path: string, payload: Record<string, unknown>, message: string, idempotent = false): Promise<T | null> {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setError(""); setSuccess("");
    const body = idempotent ? drafts.current.prepare(path, payload) : payload;
    try {
      const result = await api<T>(path, { method: "POST", body: JSON.stringify(body) });
      drafts.current.complete(path, payload); setSuccess(message); return result;
    } catch (error) {
      if (error instanceof ClientApiError && [400, 403, 404, 409].includes(error.status)) drafts.current.complete(path, payload);
      if (error instanceof ClientApiError && [401, 403].includes(error.status)) access.invalidate(errorMessage(error));
      setError(errorMessage(error)); return null;
    }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, success, run, clear: () => { setError(""); setSuccess(""); } };
}

export function ResourceNotice({ loading, error, refresh }: { loading: boolean; error: string; refresh: () => void }) {
  return <>
    {loading && <Notice>Actualizando información…</Notice>}
    {error && <Notice tone="error">{error} <button type="button" className="sc-button sc-button-secondary" onClick={refresh}><RefreshCw size={18} aria-hidden /> Reintentar</button></Notice>}
  </>;
}

export function MutationNotice({ error, success }: { error: string; success: string }) {
  return <>{error && <Notice tone="error">{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}</>;
}

export const transferLabels: Record<string, string> = {
  PENDING: "Pendiente de confirmación", VERIFIED: "Confirmada en banco", OBSERVED: "En revisión", REJECTED: "Rechazada",
};

export function transferTone(status: string): "success" | "warning" | "error" | "neutral" | "info" {
  switch (status) {
    case "VERIFIED": return "success";
    case "PENDING": return "warning";
    case "OBSERVED": return "info";
    case "REJECTED": return "error";
    default: return "neutral";
  }
}

export function localDate(value: string, withTime = false): string {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function Receipt({ id, gallery = false, path }: { id: string; gallery?: boolean; path?: string }) {
  const endpoint = path ?? `/api/comprobantes/${encodeURIComponent(id)}`;
  const session = useContext(PrivateSession);
  const invalidate = session.invalidate;
  const owner = session.user?.firebaseUid ?? "";
  const allowed = !session.loading && Boolean(owner) && ["ADMIN", "CLIENT"].includes(session.user?.role ?? "");
  const [imageRecord, setImageRecord] = useState<{ owner: string; url: string } | null>(null);
  const [errorRecord, setErrorRecord] = useState<{ owner: string; message: string } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const controllers = useRef(new Set<AbortController>());
  const imageUrl = allowed && imageRecord?.owner === owner ? imageRecord.url : "";
  const error = allowed && errorRecord?.owner === owner ? errorRecord.message : "";
  useEffect(() => {
    const active = controllers.current;
    return () => { for (const controller of active) controller.abort(); active.clear(); };
  }, [owner]);
  useEffect(() => {
    if (!gallery || !allowed) return;
    let active = true; let url = "";
    const controller = new AbortController();
    apiBlob(endpoint, { signal: controller.signal }).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob); setImageRecord({ owner, url }); setErrorRecord(null);
    }).catch((error: unknown) => { if (active) {
      if (error instanceof ClientApiError && [401, 403].includes(error.status)) invalidate(errorMessage(error));
      setImageRecord(null); setErrorRecord({ owner, message: errorMessage(error) });
    } });
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [endpoint, gallery, epoch, owner, allowed, invalidate]);
  async function openReceipt() {
    if (busy || !allowed) return;
    const tab = window.open("", "_blank");
    if (tab) { tab.opener = null; tab.document.title = "Cargando comprobante…"; }
    const controller = new AbortController(); controllers.current.add(controller);
    setBusy(true); setErrorRecord(null);
    try {
      const blob = await apiBlob(endpoint, { signal: controller.signal });
      if (controller.signal.aborted) throw new Error("El acceso cambió. Vuelve a abrir el comprobante con tu cuenta actual.");
      let currentUid: string | null = null; let configured = true;
      try { currentUid = getFirebaseAuth().currentUser?.uid ?? null; } catch { configured = false; }
      if (configured && currentUid !== owner) throw new Error("La cuenta cambió. Vuelve a abrir el comprobante con tu cuenta actual.");
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.replace(url);
      else { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `comprobante-${id}.webp`; anchor.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      tab?.close();
      if (error instanceof ClientApiError && [401, 403].includes(error.status)) invalidate(errorMessage(error));
      setErrorRecord({ owner, message: errorMessage(error) });
    }
    finally { controllers.current.delete(controller); setBusy(false); }
  }
  if (!allowed) return null;
  return <div className="sc-receipt">
    {gallery && (imageUrl ? <img className="sc-receipt-image" src={imageUrl} alt="Comprobante de transferencia para revisión bancaria" width={320} height={320} /> : <p><FileImage size={24} aria-hidden /> Cargando comprobante…</p>)}
    {error && <Notice tone="error">{error} {gallery && <button type="button" className="sc-button sc-button-secondary" onClick={() => setEpoch((value) => value + 1)}>Reintentar imagen</button>}</Notice>}
    <button type="button" className="sc-button sc-button-secondary" disabled={busy} onClick={openReceipt}><ExternalLink size={18} aria-hidden /> {busy ? "Abriendo…" : "Ver comprobante"}<span className="sr-only"> (abre una nueva pestaña)</span></button>
  </div>;
}

export function History({ movements, showAdjustmentIds = false }: { movements: Movement[]; showAdjustmentIds?: boolean }) {
  if (!movements.length) return <Notice>Esta tarjeta todavía no tiene movimientos registrados.</Notice>;
  const labels: Record<string, string> = { VISIT: "Visita", OPENING: "Saldo de apertura", ADJUSTMENT: "Ajuste de saldo", TRANSFER_REVERSAL: "Reverso de transferencia" };
  const days = new Map<string, Movement[]>();
  for (const movement of [...movements].sort((a, b) => b.client_sequence - a.client_sequence)) {
    const date = localDate(movement.created_at);
    const group = days.get(date);
    if (group) group.push(movement);
    else days.set(date, [movement]);
  }
  return <div className="sc-history">
    {[...days].map(([date, dayMovements]) => <section className="sc-history-day" aria-label={date} key={date}>
      <h3 className="sc-history-date"><CalendarDays size={17} aria-hidden /> {date}</h3>
      <div className="sc-history-movements">
        {dayMovements.map((movement) => <article className="sc-panel sc-history-card" key={movement.id}>
          <div className="sc-history-header">
            <div className="sc-history-kind">
              <Badge tone={movement.movement_type === "TRANSFER_REVERSAL" ? "error" : "neutral"}>{labels[movement.movement_type] ?? movement.movement_type}</Badge>
              <p className="sc-muted">{localDate(movement.created_at, true)}</p>
            </div>
            <div className="sc-history-balance">
              <small>Saldo después del movimiento</small>
              <strong><Money value={Math.abs(movement.new_balance)} /></strong>
              {movement.new_balance < 0 && <span>Saldo a favor</span>}
            </div>
          </div>
          <dl className="sc-history-summary">
            <div><dt>{movement.previous_balance < 0 ? "Saldo anterior a favor" : "Saldo anterior"}</dt><dd><Money value={Math.abs(movement.previous_balance)} /></dd></div>
            {movement.payment_amount > 0 && <div><dt>Abono {movement.payment_method === "CASH" ? "en efectivo" : "por transferencia"}</dt><dd><Money value={movement.payment_amount} /></dd></div>}
            {movement.charge_amount > 0 && <div><dt>Productos</dt><dd><Money value={movement.charge_amount} /></dd></div>}
            {movement.adjustment_amount !== 0 && <div><dt>Ajuste</dt><dd><Money value={movement.adjustment_amount} /></dd></div>}
          </dl>
          {movement.items.length > 0 && <div>
            <h4 className="sc-muted">Productos recibidos</h4>
            <ul className="sc-history-products">
              {movement.items.map((item) => <li className="sc-history-product" key={item.product_id}>
                <div><strong>{item.product_name_snapshot}</strong><p className="sc-history-product-detail"><span>Cantidad: {item.qty}</span><span>Precio fiado: <Money value={item.unit_credit_price} /></span></p></div>
                <p className="sc-history-product-total"><span>Total</span><strong><Money value={item.subtotal} /></strong></p>
              </li>)}
            </ul>
          </div>}
          {movement.payment_method === "TRANSFER" && <div className="sc-history-transfer">
            <Badge tone={transferTone(movement.transfer_status)}>{transferLabels[movement.transfer_status]}</Badge>
            {["PENDING", "OBSERVED"].includes(movement.transfer_status) && <p>El abono ya se descontó provisionalmente del saldo.</p>}
            {movement.transfer_status === "REJECTED" && <p>El importe volvió al saldo mediante un reverso registrado.</p>}
          </div>}
          {movement.reason && <p className="sc-history-reason"><strong>Motivo:</strong> {movement.reason}</p>}
          {(showAdjustmentIds && movement.movement_type === "ADJUSTMENT" || movement.receipt_id) && <div className="sc-history-footer">
            {showAdjustmentIds && movement.movement_type === "ADJUSTMENT" && <AdjustmentIdentity id={movement.id} />}
            {movement.receipt_id && <Receipt id={movement.receipt_id} />}
          </div>}
        </article>)}
      </div>
    </section>)}
  </div>;
}

function AdjustmentIdentity({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(id); setMessage("ID del ajuste copiado."); }
    catch { setMessage("Selecciona y copia el ID que se muestra arriba."); }
  }
  return <div style={{ marginBlock: 14 }}><p className="sc-muted">ID del ajuste compensatorio</p><code style={{ display: "block", overflowWrap: "anywhere", marginBottom: 10 }}>{id}</code><button type="button" className="sc-button sc-button-secondary" onClick={() => void copy()}><Copy size={18} aria-hidden /> Copiar ID del ajuste</button>{message && <p role="status" className="sc-muted" style={{ marginTop: 10 }}>{message}</p>}</div>;
}
