"use client";

import { RefreshCw, WalletCards } from "lucide-react";
import { AppShell, Badge, Money, Notice } from "@/components/ui";
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
    <ResourceNotice {...resource} />
    {client && <>
      <section className="sc-panel sc-account-card" aria-labelledby="account-client-name">
        <div className="sc-account-card-header">
          <Badge tone="neutral"><WalletCards size={16} aria-hidden /> Tarjeta #{client.route_order}</Badge>
          <button type="button" className="sc-button sc-button-secondary" disabled={resource.loading} onClick={resource.refresh}><RefreshCw size={18} aria-hidden /> Actualizar tarjeta</button>
        </div>
        <div className="sc-account-identity">
          <h2 id="account-client-name">{client.name}</h2>
          <p>{client.address}</p>
          <p className="sc-muted">{client.address_reference}</p>
        </div>
        <div className="sc-account-balance">
          <p className="sc-account-balance-label">{client.current_balance < 0 ? "Tu saldo a favor" : "Tu saldo pendiente actual"}</p>
          <p className="sc-account-balance-amount"><Money value={Math.abs(client.current_balance)} /></p>
          {client.current_balance === 0 && <p>Tu tarjeta está al día.</p>}
          {client.current_balance < 0 && <p>Este importe está a tu favor para próximas compras.</p>}
        </div>
      </section>
      {pending.length > 0 && <Notice tone="warning"><strong>{pending.length} {pending.length === 1 ? "transferencia está pendiente" : "transferencias están pendientes"} de confirmación bancaria por <Money value={pending.reduce((sum, movement) => sum + movement.payment_amount, 0)} />.</strong> Esos abonos ya se descontaron provisionalmente de tu saldo. Una transferencia En revisión conserva ese descuento; si se rechaza, verás el reverso en el historial.</Notice>}
      <div className="sc-section-heading"><h2>Productos y abonos · más recientes primero</h2></div>
      <History movements={resource.data!.history} />
    </>}
  </AppShell>;
}
