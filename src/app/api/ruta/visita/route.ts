import { apiRoute, readJson } from "@/lib/api";
import { registerVisit } from "@/lib/operations/visits";

export async function POST(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => registerVisit(env.DB, principal, await readJson(request)));
}
