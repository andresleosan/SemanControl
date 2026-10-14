import type { Principal } from "./auth/types";
export type { Principal };
export interface ClientCard {id:string;name:string;address:string;address_reference:string;route_order:number;linked_email:string|null;current_balance:number;is_active:number;revision:number;visited_by?:string|null;visits_count?:number}
export interface RouteProduct {id:string;name:string;credit_price:number;remaining_qty:number;initial_qty:number}
export interface MovementItem {product_id:string;product_name_snapshot:string;qty:number;unit_credit_price:number;subtotal:number}
export interface Movement {id:string;client_id:string;dispatch_id:string|null;worker_user_id:string;movement_type:string;previous_balance:number;payment_amount:number;payment_method:"NONE"|"CASH"|"TRANSFER";transfer_status:string;charge_amount:number;adjustment_amount:number;new_balance:number;reason:string|null;created_at:string;client_sequence:number;receipt_id?:string|null;items:MovementItem[]}
export interface VisitInput {idempotency_key:string;dispatch_id:string;client_id:string;expected_revision:number;expected_balance:number;payment_amount:number;payment_method:"NONE"|"CASH"|"TRANSFER";receipt_id?:string|null;items:{product_id:string;qty:number;unit_credit_price:number}[]}
export interface User {id:string;name:string;email:string;role:string;is_active:number}
export interface Dispatch {id:string;name:string;dispatch_date:string;status:"OPEN"|"CLOSED";workers:{id:string;name:string}[];inventory:RouteProduct[]}
export interface AdminProduct {id:string;name:string;cost_price:number;credit_price:number;total_stock:number;is_active:number;reserved_stock:number;available_stock:number}
