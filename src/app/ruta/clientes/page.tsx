import WorkerClients from "./worker-clients";

export default async function WorkerClientsPage({ searchParams }: { searchParams: Promise<{ dispatch_id?: string }> }) {
  return <WorkerClients initialDispatch={(await searchParams).dispatch_id ?? ""} />;
}
