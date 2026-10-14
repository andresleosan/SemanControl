import RouteSummary from "./route-summary";
export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ dispatch_id?: string }> }) {
  return <RouteSummary initialDispatch={(await searchParams).dispatch_id ?? ""} />;
}
