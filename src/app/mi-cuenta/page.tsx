"use client";

import { RefreshCw, WalletCards } from "lucide-react";
import { AppShell, Money, Notice } from "@/components/ui";
import { History, ResourceNotice, RoleBoundary, useResource } from "../admin/_components";
import type { ClientCard, Movement } from "../admin/_types";

export default function MyAccountPage() {
  return <RoleBoundary role="CLIENT"><MyAccountScreen /></RoleBoundary>;
}

function MyAccountScreen() {
  const resource = useResource<{ client: ClientCard; history: Movement[] }>("/api/mi-cuenta");
  const client = resource.data?.client;
  const pending = resource.data?.history.filter((movement) => movement.payment_method === "TRANSFER" && ["PENDING", "OBSERVED"].includes(movement.transfer_status)) ?? [];
  return <AppShell role="CLIENT" title="Mi tarjeta digital" subtitle="Consulta tus productos, abonos y saldo en un solo lugar.">
    <div className="sc-actions" style={{ justifyContent: "end", marginBottom: 16 }}><button type="button" className="sc-button sc-button-secondary" disabled={resource.loading} onClick={resource.refresh}><RefreshCw size={18} aria-hidden /> Actualizar tarjeta</button></div>
    <ResourceNotice {...resource} />
    {client && <>
      <section className="sc-panel" style={{ borderTop: "5px solid #155f4b" }}>
        <div className="sc-actions" style={{ justifyContent: "space-between" }}><span className="sc-badge" style={{ fontSize: 18 }}>Tarjeta #{client.route_order}</span><WalletCards size={30} color="#155f4b" aria-hidden /></div>
        <h2 style={{ fontSize: 26, marginTop: 18 }}>{client.name}</h2><p>{client.address}</p><p className="sc-muted">{client.address_reference}</p>
        <div style={{ marginTop: 24, padding: 20, borderRadius: 12, background: "#e4f0e9" }}><p style={{ color: "#104b3b", fontWeight: 700 }}>{client.current_balance < 0 ? "Tu saldo a favor" : "Tu saldo pendiente actual"}</p><p style={{ fontSize: "clamp(30px,8vw,46px)", color: "#104b3b", fontWeight: 800 }}><Money value={Math.abs(client.current_balance)} /></p>{client.current_balance === 0 && <p>Tu tarjeta está al día.</p>}{client.current_balance < 0 && <p>Este importe está a tu favor para próximas compras.</p>}</div>
      </section>
      {pending.length > 0 && <Notice>{pending.length} {pending.length === 1 ? "transferencia está pendiente" : "transferencias están pendientes"} de confirmación bancaria por <Money value={pending.reduce((sum, movement) => sum + movement.payment_amount, 0)} />. Esos abonos ya se descontaron provisionalmente de tu saldo. Una transferencia En revisión conserva ese descuento; si se rechaza, verás el reverso en el historial.</Notice>}
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Productos y abonos · más recientes primero</h2><History movements={resource.data!.history} />
    </>}
  </AppShell>;
}
