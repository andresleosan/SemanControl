import { apiRoute } from "@/lib/api";
import { readRoute } from "@/lib/operations/route";

export async function GET(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => readRoute(env.DB, principal, new URL(request.url).searchParams.get("dispatch_id")));
}
