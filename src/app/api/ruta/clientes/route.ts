import { apiRoute, readJson } from "@/lib/api";
import { createRouteClient, readWorkerClients } from "@/lib/operations/route";

export async function GET(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => readWorkerClients(env.DB, principal));
}

export async function POST(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => createRouteClient(env.DB, principal, await readJson(request)));
}
