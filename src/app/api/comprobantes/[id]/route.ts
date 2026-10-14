import { apiRoute } from "@/lib/api";
import { readReceipt } from "@/lib/operations/receipts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, ["ADMIN", "WORKER", "CLIENT"], async (env, principal) => readReceipt(env, principal, (await context.params).id));
}
