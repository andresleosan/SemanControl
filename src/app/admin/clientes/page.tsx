import ClientDirectory from "./client-directory";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const clientId = typeof query.client_id === "string" ? query.client_id.slice(0, 100) : "";
  const rawDelta = typeof query.adjustment_delta === "string" ? query.adjustment_delta : "";
  const delta = rawDelta && Number.isSafeInteger(Number(rawDelta)) && Number(rawDelta) !== 0 ? rawDelta : "";
  const reason = typeof query.adjustment_reason === "string" ? query.adjustment_reason.slice(0, 500) : "";
  return <ClientDirectory initialClientId={clientId} initialAdjustmentDelta={delta} initialAdjustmentReason={reason} />;
}
