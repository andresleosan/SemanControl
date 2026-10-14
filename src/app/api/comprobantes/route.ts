import { apiRoute } from "@/lib/api";
import { readReceiptForm, uploadReceipt } from "@/lib/operations/receipts";

export async function POST(request: Request) {
  return apiRoute(request, ["WORKER"], async (env, principal) => uploadReceipt(env, principal, await readReceiptForm(request)));
}
