import { apiRoute } from "@/lib/api";
import { readRouteClient } from "@/lib/operations/route";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, ["WORKER"], async (env, principal) => {
    const { id } = await context.params;
    return readRouteClient(env.DB, principal, id, new URL(request.url).searchParams.get("dispatch_id") ?? "");
  });
}
