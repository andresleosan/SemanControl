import { apiRoute, readJson } from "@/lib/api";
import { identifier } from "@/lib/operations/core";
import { confirmSynchronized, readRouteSummary } from "@/lib/operations/route";

export async function GET(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => readRouteSummary(env.DB, principal, new URL(request.url).searchParams.get("dispatch_id") ?? ""));
}
export async function POST(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => {
    const body = await readJson(request);
    return confirmSynchronized(env.DB, principal, identifier(body.dispatch_id, "el recorrido"));
  });
}
