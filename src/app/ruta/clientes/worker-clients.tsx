"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw, Search } from "lucide-react";
import { AppShell, Badge, Field, Money, Notice } from "@/components/ui";
import { api, ClientApiError, useSession } from "@/lib/client-api";
import type { WorkerClientsData } from "@/lib/contracts";
import { readLocal, saveLocal } from "@/lib/offline/storage";
import { errorText, useConnection } from "../route-shared";

type BalanceFilter = "all" | "debt" | "settled" | "credit";
interface DirectoryState {
  uid: string;
  data: WorkerClientsData | null;
  observedAt: string | null;
  stale: boolean;
  loading: boolean;
  error: string | null;
}
const filters: { value: BalanceFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "debt", label: "Con deuda" },
  { value: "settled", label: "Al día" },
  { value: "credit", label: "A favor" },
];
function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
}

export default function WorkerClients({ initialDispatch = "" }: { initialDispatch?: string }) {
  const { user, loading: sessionLoading, error: sessionError } = useSession();
  const uid = user?.role === "WORKER" && !sessionError ? user.firebaseUid : undefined;
  const online = useConnection();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BalanceFilter>("all");
  const [state, setState] = useState<DirectoryState>({ uid: "", data: null, observedAt: null, stale: false, loading: true, error: null });
  const requestVersion = useRef(0);
  const deniedUids = useRef(new Set<string>());
  const load = useCallback(async () => {
    if (!uid) return;
    const version = ++requestVersion.current;
    setState((previous) => ({ uid, data: previous.uid === uid ? previous.data : null, observedAt: previous.uid === uid ? previous.observedAt : null, stale: previous.uid === uid && previous.stale, loading: true, error: null }));
    try {
      const data = await api<WorkerClientsData>("/api/ruta/clientes");
      if (version !== requestVersion.current) return;
      const observedAt = new Date().toISOString();
      // A storage failure must not discard a successful server consultation.
      await saveLocal("snapshots", uid, "worker-clients", data).catch(() => undefined);
      if (version === requestVersion.current) {
        deniedUids.current.delete(uid);
        setState({ uid, data, observedAt, stale: false, loading: false, error: null });
      }
    } catch (error) {
      if (version !== requestVersion.current) return;
      const denied = error instanceof ClientApiError && [401, 403].includes(error.status);
      if (denied) deniedUids.current.add(uid);
      const saved = deniedUids.current.has(uid) ? null : await readLocal<WorkerClientsData>("snapshots", uid, "worker-clients").catch(() => null);
      if (version === requestVersion.current) setState({ uid, data: saved?.value ?? null, observedAt: saved?.observed_at ?? null, stale: !!saved, loading: false, error: saved ? null : errorText(error) });
    }
  }, [uid]);
  useEffect(() => {
    let active = true;
    const requests = requestVersion;
    void Promise.resolve().then(() => { if (active) void load(); });
    const reconnect = () => void load();
    window.addEventListener("online", reconnect);
    return () => { active = false; requests.current++; window.removeEventListener("online", reconnect); };
  }, [load]);

  const data = uid && state.uid === uid ? state.data : null;
  const busy = sessionLoading || (!!uid && (state.uid !== uid || state.loading));
  const query = normalize(search);
  const order = /^#?\d+$/.test(query) ? Number(query.replace("#", "")) : null;
  const clients = data?.clients.filter((client) => {
    const balanceMatches = filter === "all" || (filter === "debt" ? client.current_balance > 0 : filter === "settled" ? client.current_balance === 0 : client.current_balance < 0);
    const searchMatches = order !== null ? client.route_order === order : normalize(`${client.name} ${client.address} ${client.address_reference}`).includes(query);
    return balanceMatches && searchMatches;
  }) ?? [];
  const error = sessionError || (user && user.role !== "WORKER" ? "Esta consulta es para trabajadores." : state.uid === uid ? state.error : null);

  return <AppShell role="WORKER" dispatchId={initialDispatch} title="Clientes" subtitle="Busca una tarjeta y consulta su deuda al instante.">
    {error && <Notice tone="error">{error}</Notice>}
    {busy && !data && <Notice>Consultando clientes…</Notice>}
    {data && state.observedAt && <Notice tone={state.stale || !online ? "warning" : "info"}>
      {state.stale || !online ? `${!online ? "Sin conexión" : "No pudimos actualizar"} · última consulta: ` : "Última consulta: "}
      {new Date(state.observedAt).toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: false })}.
      {(state.stale || !online) && " Los saldos pueden haber cambiado. Conéctate y actualiza antes de confirmarlos."}
    </Notice>}
    <section className="sc-panel sc-client-directory-controls" aria-label="Consultar clientes">
      <Field label="Buscar cliente"><span className="sc-client-directory-search"><Search size={20} aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, dirección o #tarjeta" /></span></Field>
      <div className="sc-segmented" role="group" aria-label="Filtrar por saldo">{filters.map(({ value, label }) => <button type="button" className="sc-button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="sc-client-directory-footer">{data && <p className="sc-muted" role="status">{clients.length} de {data.clients.length} clientes activos</p>}<button type="button" className="sc-button sc-button-secondary" onClick={() => void load()} disabled={!uid || busy || !online}><RefreshCw size={18} aria-hidden="true" />{busy ? "Actualizando…" : "Actualizar clientes"}</button></div>
    </section>
    {data && <p className="sc-muted">Saldos de pagos y entregas ya sincronizados.</p>}
    {data && !clients.length && <Notice>{data.clients.length ? "No hay clientes que coincidan con tu búsqueda y filtro." : "Aún no hay clientes activos."}</Notice>}
    <section className="sc-route-list" aria-label="Clientes y saldos">{clients.map((client) => <article className="sc-route-card sc-client-directory-card" key={client.id} aria-labelledby={`client-name-${client.id}`}>
      <strong className="sc-route-card__number">#{client.route_order}</strong>
      <div className="sc-route-card__body">
        <h2 id={`client-name-${client.id}`}>{client.name}</h2>
        <div className="sc-client-directory-balance"><span className="sc-route-card__balance"><small>{client.current_balance > 0 ? "Deuda actual" : client.current_balance < 0 ? "Saldo a favor" : "Saldo actual"}</small><Money value={Math.abs(client.current_balance)} /></span><Badge tone={client.current_balance > 0 ? "warning" : client.current_balance < 0 ? "info" : "success"}>{client.current_balance > 0 ? "Con deuda" : client.current_balance < 0 ? "A favor" : "Al día"}</Badge></div>
        <p className="sc-route-card__address"><MapPin size={15} aria-hidden="true" />{client.address}</p>
        <p className="sc-muted">{client.address_reference}</p>
      </div>
    </article>)}</section>
  </AppShell>;
}
