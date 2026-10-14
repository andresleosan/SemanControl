import RouteBoard from "./route-board";
export default async function RoutePage({ searchParams }: { searchParams: Promise<{ dispatch_id?: string }> }) {
  return <RouteBoard initialDispatch={(await searchParams).dispatch_id ?? ""} />;
}
