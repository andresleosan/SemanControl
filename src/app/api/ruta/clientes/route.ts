import { apiRoute, readJson } from "@/lib/api";
import { createRouteClient } from "@/lib/operations/route";

export async function POST(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => createRouteClient(env.DB, principal, await readJson(request)));
}
