# Contratos operativos — aprobados 2026-10-14

API JSON snake_case. Errores `{error:{code,message}}` (400 validación, 401 sesión, 403 permisos, 404 inexistente, 409 conflicto). Las lecturas son no-store. Helpers UI `api<T>(path, options?)`, `useSession()` y componentes en `src/components/ui.tsx` serán proporcionados por raíz.

## Trabajador
- GET `/api/ruta`: `{dispatches:[{id,name,dispatch_date,status}],clients:[ClientCard],inventory:[RouteProduct]}`. Query `dispatch_id` opcional; si varios no seleccionar silenciosamente. ClientCard `{id,name,address,address_reference,route_order,linked_email,current_balance,is_active,revision,visited_by?:string|null,visits_count?:number}`. RouteProduct `{id,name,credit_price,remaining_qty,initial_qty}`. Clients ordenados. Solo recorridos asignados; clientes activos del directorio.
- GET `/api/ruta/cliente/{id}?dispatch_id=...`: `{client:ClientCard,inventory:RouteProduct[],history:Movement[]}`.
- GET `/api/ruta/clientes`: `{clients:[{id,name,address,address_reference,route_order,current_balance}]}`. Consulta de solo lectura para WORKER activo, sin requerir recorrido asignado o abierto; tarjetas activas ordenadas por número. No incluye correo, costos, margen ni auditoría. El saldo es el confirmado por el servidor; las visitas pendientes de sincronizar aún pueden cambiarlo.
- POST `/api/ruta/clientes`: `{name,address,address_reference,linked_email?:string|null}` → `{client:ClientCard}`. Orden máximo+1 atómico.
- POST `/api/ruta/visita`: `{idempotency_key:UUID,dispatch_id,client_id,expected_revision,expected_balance,payment_amount,payment_method:'NONE'|'CASH'|'TRANSFER',receipt_id?:string|null,items:[{product_id,qty,unit_credit_price}]}` → `{movement:Movement,replayed:boolean}`. Error 409 conserva cola; nunca modifica payload al reintentar. Visita sin abono/productos permitida y audita atención.
- POST `/api/comprobantes`: FormData `file` (WebP), `receipt_id` UUID, `client_id`, `dispatch_id` → `{receipt_id}`. Reintento UUID mismo archivo/actor solo devuelve existente.
- GET `/api/comprobantes/{id}`: archivo privado autorizado. Id en Movement.receipt_id, nunca URL pública R2.
- GET `/api/ruta/resumen?dispatch_id=...`: `{dispatch:{id,name,status,dispatch_date},cash_total,transfer_total,transfer_count,inventory:RouteProduct[],sync_confirmed:boolean}`. Cobros propios, sobrantes compartidos.
- POST `/api/ruta/resumen`: `{dispatch_id}` → `{ok:true}` declara haber sincronizado pendientes. UI bloquea con cola pendiente local; futuras visitas invalidan declaración.
- POST `/api/vinculo`: `{client_id,dispatch_id,linked_email?:string}` → `{url,expires_at}`. Si email proporcionado, preautoriza vínculo sin reemplazar UID; además emite QR. Token QR lo consume POST `/api/vinculo/consumir` `{token}` con Bearer Google válido aun antes de tener rol, requiere Origin. → sesión CLIENT y `{redirectTo:'/mi-cuenta'}`.

Movement público `{id,client_id,dispatch_id,worker_user_id,movement_type,previous_balance,payment_amount,payment_method,transfer_status,charge_amount,adjustment_amount,new_balance,reason,created_at,client_sequence,receipt_id?:string|null,items:[{product_id,product_name_snapshot,qty,unit_credit_price,subtotal}]}`. Sin costos.

## Administrador
- GET `/api/admin/inventario`: `{products:[AdminProduct],workers:[User],dispatches:[Dispatch]}`. AdminProduct añade `cost_price,total_stock,is_active,reserved_stock,available_stock`. Dispatch añade `workers:[{id,name}],inventory:RouteProduct[]`.
- POST `/api/admin/productos`: `{id?:string,name,cost_price,credit_price,is_active?:number,reason}` → `{ok:true}` crear/editar, desactivar como eliminación segura. Alta stock inicial 0.
- POST `/api/admin/compras`: `{idempotency_key,product_id,qty,unit_cost_price,reason}` → `{ok:true}` compra cantidad positiva, costo maestro actualizado y evento stock.
- POST `/api/admin/stock`: `{idempotency_key,product_id,delta,reason}` → `{ok:true}` ajuste firmado, reservas protegidas.
- POST `/api/admin/recorridos`: `{name,dispatch_date,worker_ids:string[],items:[{product_id,qty}]}` → `{id}`.
- POST `/api/admin/trabajadores`: `{id?:string,name,email,is_active?:number,reason}` → `{ok:true}` preautorizar WORKER/activar/desactivar. UID existente no se sobreescribe.
- GET `/api/admin/cierre?dispatch_id=...`: `{dispatches:Dispatch[],selected:Dispatch|null,workers:[{id,name,cash_total,transfer_total,transfer_count,sync_confirmed}],cash_total,transfer_total,inventory:RouteProduct[],transfers:[Movement & {client_name,worker_name}],closure?:object|null}`.
- POST `/api/admin/cierre`: `{idempotency_key,dispatch_id,received_cash,returns:[{product_id,received_qty}],reason,returns_confirmed:true}` → `{ok:true}` exige declaraciones de sincronización por trabajador, motivo para diferencias, cierre atómico con eventos y sin reañadir stock.
- POST `/api/admin/transferencias`: `{idempotency_key,movement_id,status:'VERIFIED'|'OBSERVED'|'REJECTED',reason}` → `{ok:true}` estado bancario auditado; REJECTED reverso único incluso tras cierre.
- GET `/api/admin/clientes`: `{clients:ClientCard[],portfolio_total,estimated_margin,inherited_balance}`. Query fechas `from`, `to` YYYY-MM-DD opcional para margen por período.
- GET `/api/admin/clientes/{id}`: `{client:ClientCard,history:Movement[],audit:object[]}`.
- POST `/api/admin/clientes`: `{id?:string,name,address,address_reference,route_order?:number,linked_email?:string|null,is_active?:number,reason,opening_balance?:number,idempotency_key?:UUID}` → `{id}`. Alta requiere UUID y registra el saldo físico (default 0, puede quedar a favor) mediante OPENING; editar no acepta opening_balance. Email modificado revoca UID y QR pendientes en el mismo batch y queda auditado. Reordenar intercambia posición ocupada atómicamente.
- POST `/api/admin/ajustes`: `{idempotency_key,client_id,expected_revision,delta,reason}` → `{ok:true}` asiento ADJUSTMENT, no edición desnuda de saldo.
- GET `/api/mi-cuenta`: `{client:ClientCard,history:Movement[]}` tarjeta exclusiva de Principal.clientId.
- POST `/api/ruta/incidencias`: multipart `payload` (JSON original exacto), `photo` WebP opcional. Solo recorridos CLOSED asignados. → `{incident_id}` o `{already_registered:true,movement_id}` si la respuesta original se perdió. No cambia stock ni saldo.
- GET `/api/admin/incidencias?dispatch_id=...`: `{incidents:[{id,client_id,dispatch_id,client_name,worker_name,payload,status,created_at,receipt_available,resolution_note,adjustment_id}]}`.
- POST `/api/admin/incidencias`: `{id,reason,adjustment_id?:string}` → `{ok:true}`. Si neto distinto de cero, exige ADJUSTMENT existente de la misma tarjeta y cantidad exacta, sin reutilizarlo en otra incidencia. Neto cero admite nota. No aplica el ajuste otra vez.
- GET `/api/ruta/incidencias/{id}/comprobante`: imagen privada ADMIN o WORKER propietario; middleware y handler autorizan ambos roles.
- POST `/api/admin/comprobantes/limpiar`: `{}` → `{deleted:number}`, archivos sin asociación tras 48h y uploads interrumpidos auditados; preserva comprobantes de visitas/incidencias y mantiene cuarentena ante fallos de R2.

## Esquema común de integración
0002 agrega clients.revision; ledger_movements.client_sequence y request_hash; movement_items.unit_cost_price privado nullable; dispatch_workers.pending_sync_confirmed_at. Tabla operation_guards(id,ok CHECK(ok=1)) para abortar batches, eliminada al finalizar; operation_requests(idempotency_key PK,actor_id,payload_hash,result_json,created_at) para idempotencia administrativa. Tablas audit_events(id,actor_id,action,entity_id,reason,previous_json,next_json,created_at), stock_events(id,actor_id,product_id,delta,previous_stock,new_stock,reason,created_at), dispatch_closures(dispatch_id PK,admin_id,expected_cash,received_cash,reason,created_at), dispatch_returns(dispatch_id,product_id,expected_qty,received_qty), receipts(id PK,owner_user_id,client_id,dispatch_id,r2_key,file_hash,byte_size,width,height,movement_id UNIQUE NULL,created_at), link_tokens(token_hash PK,client_id,created_by,expires_at,consumed_at), app_secrets(name PK,value). Leer nombres exactos desde la migración antes de implementar.
