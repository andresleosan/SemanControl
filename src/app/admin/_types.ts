import type { Dispatch, Movement, RouteProduct, User } from "@/lib/contracts";
export type { AdminProduct, ClientCard, Dispatch, Movement, RouteProduct } from "@/lib/contracts";
export type Worker = Pick<User, "id" | "name" | "email" | "is_active">;
export interface ClosureData {
  dispatches: Dispatch[]; selected: Dispatch | null;
  workers: { id: string; name: string; cash_total: number; transfer_total: number; transfer_count: number; sync_confirmed: boolean }[];
  cash_total: number; transfer_total: number; inventory: RouteProduct[];
  transfers: (Movement & { client_name: string; worker_name: string })[];
  closure?: {
    expected_cash?: number; received_cash?: number; reason?: string; created_at?: string;
    returns?: { product_id: string; expected_qty: number; received_qty: number }[];
  } | null;
}
