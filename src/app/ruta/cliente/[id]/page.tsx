import VisitView from "./visit-view";
export default async function ClientVisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dispatch_id?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <VisitView id={id} dispatch={query.dispatch_id ?? ""} />;
}
