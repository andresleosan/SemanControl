# Especificación Técnica y Prompt Maestro: SemanControl

Actúa como un Arquitecto de Software Senior y Desarrollador Full-Stack especialista en el ecosistema Cloudflare Edge, Next.js (App Router), TypeScript, Tailwind CSS y Firebase Auth.

Vamos a construir **SemanControl**, una plataforma web PWA (Mobile-First) para digitalizar un negocio de venta y cobro de productos fiados puerta a puerta (recorridos de los viernes con más de 100 tarjetas físicas).

---

## 1. Stack Tecnológico y Entorno

- **Framework:** Next.js (App Router) + React + TypeScript.
- **Estilos:** Tailwind CSS + Lucide Icons (interfaz táctil de alto contraste para uso en calle con una sola mano).
- **Autenticación:** Firebase Authentication (exclusivamente **Google Sign-In**).
- **Backend / Edge API:** Route Handlers de Next.js en **Cloudflare Workers**, con `@opennextjs/cloudflare` (OpenNext), runtime Node.js de Next.js y `nodejs_compat`. No usar `@cloudflare/next-on-pages`, que está deprecado.
- **Base de Datos Relacional:** **Cloudflare D1 (SQLite)**.
- **Almacenamiento de Archivos:** **Cloudflare R2** (para captures de transferencias bancarias).

---

## 2. Reglas Críticas de Negocio y Seguridad (Innegociables)

1. **Aislamiento Estricto de Costos (`cost_price`):**
   - El campo `cost_price` de la tabla `products` es **exclusivo del rol `ADMIN`**.
   - Ningún endpoint consumido por `WORKER` o `CLIENT` puede incluir `cost_price` en el `SELECT` de SQL ni en el JSON de respuesta.
2. **Descuento Doble Atómico de Inventario (`db.batch`):**
   - El jefe carga compras al inventario general (`products.total_stock`) y crea recorridos (`route_dispatches`) asignando 1 o varios trabajadores (`dispatch_workers`) y una carga de productos (`dispatch_inventory`).
   - Cuando el trabajador entrega productos en la puerta de un cliente, se debe ejecutar una transacción atómica en D1 (`env.DB.batch`) que:
     1. Descuente la cantidad de `dispatch_inventory.remaining_qty` (inventario asignado a ese recorrido).
     2. Descuente la cantidad de `products.total_stock` (inventario total del jefe).
     3. Sume el valor total (a `credit_price`) al saldo del cliente (`clients.current_balance`).
     4. Inserte el movimiento en el historial (`ledger_movements` y `movement_items`).
   - `total_stock` incluye bodega y calle. Asignar una carga reserva unidades, sin descontar el total. `Disponible en Casa = total_stock - SUM(remaining_qty de recorridos OPEN)`; nunca puede ser negativo.
   - Las reservas se validan dentro de la operación atómica, no con una lectura previa solamente. Un UPDATE que afecta cero filas no equivale a un error SQL: la operación debe producir un error real o una guardia equivalente para que D1 revierta el batch.
   - Cerrar un recorrido requiere confirmar la devolución; libera la reserva, conserva el sobrante histórico y bloquea nuevas entregas. No sumar los sobrantes a `total_stock`, porque nunca salieron del total.
3. **Clientes SIN Número de Teléfono:**
   - **NO** existe campo de teléfono para los clientes.
   - Campos obligatorios: `name`, `address`, `route_order` (entero que preserva la secuencia física de las +100 tarjetas) y `address_reference` (ej. *"Reja negra, 2do piso"*).
   - Campo opcional: `linked_email` (correo Gmail para enlazar su deuda si el cliente desea consultarla).
4. **Compresión WebP en el Cliente antes de subir a R2:**
   - Antes de subir cualquier foto de transferencia a Cloudflare R2, el navegador debe comprimirla mediante HTML5 Canvas a formato **WebP** (ancho máximo `1000px`, calidad `0.75`, peso objetivo `< 100 KB`).
5. **Idempotencia en Ruta:**
   - Toda operación de cobro o entrega desde la vista del trabajador debe enviar un `idempotency_key` (UUID v4 generado en el cliente) para evitar cobros o descuentos duplicados si la señal móvil parpadea.
6. **Seguridad de Credenciales:**
   - Nunca expongas llaves privadas ni credenciales en el código fuente. Usa `.env.local` / `.dev.vars` ignorados por Git para desarrollo y secretos de Workers en producción; `wrangler.toml` solo contiene configuración pública. Valida siempre el JWT de Firebase en el servidor antes de ejecutar consultas de negocio en D1 o R2.
   - Verificar firma RS256, claves oficiales de Google, proyecto/audience, issuer, expiración, tiempos, UID, correo verificado y proveedor Google. Los roles proceden de D1, nunca del cuerpo o de headers del navegador.
   - ADMIN y WORKER se aprovisionan explícitamente en `users`; no conceder privilegios al primer usuario que inicia sesión. CLIENT deriva de una tarjeta activa vinculada, con acceso exclusivo a su información y sus comprobantes. R2 permanece privado.
   - El vínculo inicial por correo solo puede llenar un `firebase_uid` vacío. Solo ADMIN puede reemplazar un vínculo existente; la operación debe revocar el acceso anterior y ser auditable.
   - `APP_ORIGIN` define el origen público confiable. Las operaciones de sesión POST/DELETE comparan el Origin del navegador con esa configuración, porque Next.js puede reconstruir el URL internamente en Workers. No derivar permisos de Host ni headers reenviados. La cookie se marca Secure si el origen público es HTTPS.
7. **Transferencias y conciliación:**
   - `PENDING` descuenta el abono provisionalmente y se muestra como pendiente de confirmación bancaria. `OBSERVED` mantiene el descuento provisional mientras se investiga; no significa rechazo definitivo.
   - `VERIFIED` confirma el pago sin volver a descontarlo. `REJECTED` registra un `TRANSFER_REVERSAL` único, con referencia al movimiento original, motivo y ADMIN responsable, sumando nuevamente el importe a la deuda. La decisión y el reverso son atómicos e idempotentes.
8. **Historial y cantidades:**
   - Dinero en pesos colombianos enteros; precios, cobros y cargos no negativos; cantidades de entrega positivas; stock no negativo y sobrante entre cero y carga inicial.
   - Apertura desde tarjetas físicas y correcciones posteriores son movimientos `OPENING` y `ADJUSTMENT`, con responsable y motivo; nunca editar el saldo sin un asiento que lo explique.
   - La ecuación contable es `new_balance = previous_balance - payment_amount + charge_amount + adjustment_amount`. Se permiten saldos a favor; la interfaz debe identificarlos explícitamente.
   - Nuevos clientes reciben el siguiente `route_order` de forma atómica; el número es positivo y único en el directorio maestro. La referencia de dirección es obligatoria también en SQL.

---

## 3. Esquema de Base de Datos (Cloudflare D1 - SQLite)

Crea `migrations/0001_init.sql` con la estructura reforzada aprobada. El bloque siguiente debe coincidir con el archivo de migración; las restricciones protegen las reglas de negocio y los triggers preservan reservas y trazabilidad:

```sql
-- SemanControl: initial D1 schema. Rollback: docs/rollback-fase-1.md.
-- Money is integer Colombian pesos; balances/adjustments may be negative.
-- D1 enables foreign keys; SQLite callers must enable PRAGMA foreign_keys.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  firebase_uid TEXT UNIQUE CHECK (firebase_uid IS NULL OR length(trim(firebase_uid)) > 0),
  email TEXT UNIQUE NOT NULL CHECK (length(email) > 0 AND email = lower(trim(email))),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'WORKER', 'CLIENT')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(is_active) = 'integer' AND is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  address TEXT NOT NULL CHECK (length(trim(address)) > 0),
  address_reference TEXT NOT NULL CHECK (length(trim(address_reference)) > 0),
  route_order INTEGER UNIQUE NOT NULL CHECK (typeof(route_order) = 'integer' AND route_order > 0),
  linked_email TEXT UNIQUE CHECK (linked_email IS NULL OR (length(linked_email) > 0 AND linked_email = lower(trim(linked_email)))),
  firebase_uid TEXT UNIQUE CHECK (firebase_uid IS NULL OR length(trim(firebase_uid)) > 0),
  current_balance INTEGER NOT NULL DEFAULT 0 CHECK (typeof(current_balance) = 'integer'),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(is_active) = 'integer' AND is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_clients_route_order ON clients(route_order ASC);
CREATE INDEX idx_clients_linked_email ON clients(linked_email);

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  cost_price INTEGER NOT NULL CHECK (typeof(cost_price) = 'integer' AND cost_price >= 0),
  credit_price INTEGER NOT NULL CHECK (typeof(credit_price) = 'integer' AND credit_price >= 0),
  total_stock INTEGER NOT NULL DEFAULT 0 CHECK (typeof(total_stock) = 'integer' AND total_stock >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (typeof(is_active) = 'integer' AND is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE route_dispatches (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  dispatch_date TEXT NOT NULL CHECK (length(dispatch_date) = 10 AND dispatch_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_route_dispatches_status_date ON route_dispatches(status, dispatch_date);

CREATE TABLE dispatch_workers (
  dispatch_id TEXT NOT NULL,
  worker_user_id TEXT NOT NULL,
  PRIMARY KEY (dispatch_id, worker_user_id),
  FOREIGN KEY (dispatch_id) REFERENCES route_dispatches(id),
  FOREIGN KEY (worker_user_id) REFERENCES users(id)
);

CREATE INDEX idx_dispatch_workers_user ON dispatch_workers(worker_user_id, dispatch_id);

CREATE TABLE dispatch_inventory (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  dispatch_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  initial_qty INTEGER NOT NULL CHECK (typeof(initial_qty) = 'integer' AND initial_qty >= 0),
  remaining_qty INTEGER NOT NULL CHECK (typeof(remaining_qty) = 'integer' AND remaining_qty >= 0 AND remaining_qty <= initial_qty),
  UNIQUE (dispatch_id, product_id),
  FOREIGN KEY (dispatch_id) REFERENCES route_dispatches(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_dispatch_inventory_product ON dispatch_inventory(product_id, dispatch_id);

CREATE TABLE ledger_movements (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  idempotency_key TEXT UNIQUE NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  client_id TEXT NOT NULL,
  dispatch_id TEXT,
  worker_user_id TEXT NOT NULL,
  movement_type TEXT NOT NULL DEFAULT 'VISIT' CHECK (movement_type IN ('VISIT', 'OPENING', 'ADJUSTMENT', 'TRANSFER_REVERSAL')),
  previous_balance INTEGER NOT NULL CHECK (typeof(previous_balance) = 'integer'),
  payment_amount INTEGER NOT NULL DEFAULT 0 CHECK (typeof(payment_amount) = 'integer' AND payment_amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'NONE' CHECK (payment_method IN ('NONE', 'CASH', 'TRANSFER')),
  receipt_r2_key TEXT,
  transfer_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (transfer_status IN ('NOT_APPLICABLE', 'PENDING', 'VERIFIED', 'OBSERVED', 'REJECTED')),
  charge_amount INTEGER NOT NULL DEFAULT 0 CHECK (typeof(charge_amount) = 'integer' AND charge_amount >= 0),
  adjustment_amount INTEGER NOT NULL DEFAULT 0 CHECK (typeof(adjustment_amount) = 'integer'),
  new_balance INTEGER NOT NULL CHECK (typeof(new_balance) = 'integer'),
  reason TEXT,
  reverses_movement_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (dispatch_id) REFERENCES route_dispatches(id),
  FOREIGN KEY (worker_user_id) REFERENCES users(id),
  FOREIGN KEY (reverses_movement_id) REFERENCES ledger_movements(id),
  CHECK (new_balance = previous_balance - payment_amount + charge_amount + adjustment_amount),
  CHECK (
    (payment_amount = 0 AND payment_method = 'NONE' AND transfer_status = 'NOT_APPLICABLE' AND receipt_r2_key IS NULL)
    OR (payment_amount > 0 AND payment_method = 'CASH' AND transfer_status = 'NOT_APPLICABLE' AND receipt_r2_key IS NULL)
    OR (payment_amount > 0 AND payment_method = 'TRANSFER' AND transfer_status <> 'NOT_APPLICABLE' AND receipt_r2_key IS NOT NULL AND length(trim(receipt_r2_key)) > 0)
  ),
  CHECK (
    (movement_type = 'VISIT' AND dispatch_id IS NOT NULL AND adjustment_amount = 0 AND reverses_movement_id IS NULL)
    OR (movement_type = 'OPENING' AND dispatch_id IS NULL AND previous_balance = 0 AND payment_amount = 0 AND charge_amount = 0 AND reverses_movement_id IS NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)
    OR (movement_type = 'ADJUSTMENT' AND dispatch_id IS NULL AND payment_amount = 0 AND charge_amount = 0 AND adjustment_amount <> 0 AND reverses_movement_id IS NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)
    OR (movement_type = 'TRANSFER_REVERSAL' AND dispatch_id IS NULL AND payment_amount = 0 AND charge_amount = 0 AND adjustment_amount > 0 AND reverses_movement_id IS NOT NULL AND reverses_movement_id <> id AND reason IS NOT NULL AND length(trim(reason)) > 0)
  )
);

CREATE UNIQUE INDEX idx_ledger_one_opening ON ledger_movements(client_id) WHERE movement_type = 'OPENING';
CREATE INDEX idx_ledger_client_history ON ledger_movements(client_id, created_at, id);
CREATE INDEX idx_ledger_dispatch_worker ON ledger_movements(dispatch_id, worker_user_id);
CREATE INDEX idx_ledger_transfer_review ON ledger_movements(transfer_status, created_at) WHERE payment_method = 'TRANSFER';

CREATE TABLE movement_items (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  movement_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL CHECK (length(trim(product_name_snapshot)) > 0),
  qty INTEGER NOT NULL CHECK (typeof(qty) = 'integer' AND qty > 0),
  unit_credit_price INTEGER NOT NULL CHECK (typeof(unit_credit_price) = 'integer' AND unit_credit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (typeof(subtotal) = 'integer' AND subtotal >= 0 AND subtotal = qty * unit_credit_price),
  UNIQUE (movement_id, product_id),
  FOREIGN KEY (movement_id) REFERENCES ledger_movements(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_movement_items_product ON movement_items(product_id);

-- REPLACE is an INSERT plus an implicit delete, not an UPDATE. Refuse an
-- existing identity before it can bypass reservation or terminal-close guards.
-- Existing products/dispatches are changed with UPDATE, never UPSERT/REPLACE.
CREATE TRIGGER products_insert_identity_guard
BEFORE INSERT ON products
WHEN EXISTS (SELECT 1 FROM products WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_ID_ALREADY_EXISTS');
END;

CREATE TRIGGER dispatch_insert_identity_guard
BEFORE INSERT ON route_dispatches
WHEN EXISTS (SELECT 1 FROM route_dispatches WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_ID_ALREADY_EXISTS');
END;

-- Reservations are checked in the same statement that changes the load.
-- They use remaining_qty, never initial_qty: delivery reduces both reservation
-- and total_stock, while a return/closure releases reservation only.
CREATE TRIGGER dispatch_inventory_insert_guard
BEFORE INSERT ON dispatch_inventory
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_INVENTORY_ALREADY_EXISTS')
  WHERE EXISTS (
    SELECT 1 FROM dispatch_inventory existing
    WHERE existing.id = NEW.id OR (existing.dispatch_id = NEW.dispatch_id AND existing.product_id = NEW.product_id)
  );
  SELECT RAISE(ABORT, 'DISPATCH_NOT_OPEN')
  WHERE NOT EXISTS (SELECT 1 FROM route_dispatches WHERE id = NEW.dispatch_id AND status = 'OPEN');
  SELECT RAISE(ABORT, 'INSUFFICIENT_UNRESERVED_STOCK')
  WHERE NEW.remaining_qty + COALESCE((
    SELECT SUM(i.remaining_qty) FROM dispatch_inventory i
    JOIN route_dispatches d ON d.id = i.dispatch_id
    WHERE i.product_id = NEW.product_id AND d.status = 'OPEN'
  ), 0) > (SELECT total_stock FROM products WHERE id = NEW.product_id);
END;

CREATE TRIGGER dispatch_inventory_update_guard
BEFORE UPDATE ON dispatch_inventory
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_INVENTORY_IDENTITY_IMMUTABLE')
  WHERE NEW.id IS NOT OLD.id OR NEW.dispatch_id IS NOT OLD.dispatch_id OR NEW.product_id IS NOT OLD.product_id;
  SELECT RAISE(ABORT, 'DISPATCH_NOT_OPEN')
  WHERE NOT EXISTS (SELECT 1 FROM route_dispatches WHERE id = NEW.dispatch_id AND status = 'OPEN');
  SELECT RAISE(ABORT, 'INSUFFICIENT_UNRESERVED_STOCK')
  WHERE NEW.remaining_qty + COALESCE((
    SELECT SUM(i.remaining_qty) FROM dispatch_inventory i
    JOIN route_dispatches d ON d.id = i.dispatch_id
    WHERE i.product_id = NEW.product_id AND d.status = 'OPEN' AND i.id <> OLD.id
  ), 0) > (SELECT total_stock FROM products WHERE id = NEW.product_id);
END;

CREATE TRIGGER dispatch_inventory_closed_delete_guard
BEFORE DELETE ON dispatch_inventory
WHEN EXISTS (SELECT 1 FROM route_dispatches WHERE id = OLD.dispatch_id AND status = 'CLOSED')
BEGIN
  SELECT RAISE(ABORT, 'CLOSED_DISPATCH_INVENTORY_IMMUTABLE');
END;

-- Compatible with the approved delivery order: remaining first, total second.
CREATE TRIGGER products_reserved_stock_guard
BEFORE UPDATE OF total_stock ON products
WHEN NEW.total_stock < COALESCE((
  SELECT SUM(i.remaining_qty) FROM dispatch_inventory i
  JOIN route_dispatches d ON d.id = i.dispatch_id
  WHERE i.product_id = OLD.id AND d.status = 'OPEN'
), 0)
BEGIN
  SELECT RAISE(ABORT, 'STOCK_BELOW_OPEN_RESERVATIONS');
END;

CREATE TRIGGER dispatch_cannot_reopen
BEFORE UPDATE OF status ON route_dispatches
WHEN OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED'
BEGIN
  SELECT RAISE(ABORT, 'CLOSED_DISPATCH_CANNOT_REOPEN');
END;

CREATE TRIGGER dispatch_workers_insert_guard
BEFORE INSERT ON dispatch_workers
BEGIN
  SELECT RAISE(ABORT, 'ASSIGNMENT_REQUIRES_ACTIVE_WORKER_AND_OPEN_DISPATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM users u JOIN route_dispatches d ON d.id = NEW.dispatch_id
    WHERE u.id = NEW.worker_user_id AND u.role = 'WORKER' AND u.is_active = 1 AND d.status = 'OPEN'
  );
END;

CREATE TRIGGER dispatch_workers_update_guard
BEFORE UPDATE ON dispatch_workers
BEGIN
  SELECT RAISE(ABORT, 'ASSIGNMENT_REQUIRES_ACTIVE_WORKER_AND_OPEN_DISPATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM users u JOIN route_dispatches d ON d.id = NEW.dispatch_id
    WHERE u.id = NEW.worker_user_id AND u.role = 'WORKER' AND u.is_active = 1 AND d.status = 'OPEN'
  );
END;

CREATE TRIGGER ledger_insert_guard
BEFORE INSERT ON ledger_movements
BEGIN
  -- REPLACE can bypass DELETE triggers in SQLite, so reject its conflicting
  -- insert before it can remove any immutable historical row.
  SELECT RAISE(ABORT, 'LEDGER_DUPLICATE_MOVEMENT')
  WHERE EXISTS (
    SELECT 1 FROM ledger_movements existing
    WHERE existing.id = NEW.id OR existing.idempotency_key = NEW.idempotency_key
      OR (NEW.reverses_movement_id IS NOT NULL AND existing.reverses_movement_id = NEW.reverses_movement_id)
      OR (NEW.movement_type = 'OPENING' AND existing.movement_type = 'OPENING' AND existing.client_id = NEW.client_id)
  );
  SELECT RAISE(ABORT, 'VISIT_REQUIRES_ASSIGNED_ACTIVE_WORKER_AND_OPEN_DISPATCH')
  WHERE NEW.movement_type = 'VISIT' AND NOT EXISTS (
    SELECT 1 FROM dispatch_workers w
    JOIN route_dispatches d ON d.id = w.dispatch_id
    JOIN users u ON u.id = w.worker_user_id
    WHERE w.dispatch_id = NEW.dispatch_id AND w.worker_user_id = NEW.worker_user_id
      AND d.status = 'OPEN' AND u.role = 'WORKER' AND u.is_active = 1
  );
  SELECT RAISE(ABORT, 'ACCOUNTING_CHANGE_REQUIRES_ACTIVE_ADMIN')
  WHERE NEW.movement_type <> 'VISIT' AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.worker_user_id AND role = 'ADMIN' AND is_active = 1
  );
  SELECT RAISE(ABORT, 'REJECT_TRANSFER_BY_INSERTING_REVERSAL') WHERE NEW.transfer_status = 'REJECTED';
  SELECT RAISE(ABORT, 'INVALID_TRANSFER_REVERSAL')
  WHERE NEW.movement_type = 'TRANSFER_REVERSAL' AND NOT EXISTS (
    SELECT 1 FROM ledger_movements original
    WHERE original.id = NEW.reverses_movement_id AND original.client_id = NEW.client_id
      AND original.movement_type = 'VISIT' AND original.payment_method = 'TRANSFER'
      AND original.transfer_status IN ('PENDING', 'OBSERVED', 'VERIFIED')
      AND original.payment_amount = NEW.adjustment_amount
  );
END;

-- The reversal is the auditable cause of REJECTED. This trigger changes only
-- the original status; client balance must be updated in the same future batch.
CREATE TRIGGER ledger_reversal_marks_rejected
AFTER INSERT ON ledger_movements
WHEN NEW.movement_type = 'TRANSFER_REVERSAL'
BEGIN
  UPDATE ledger_movements SET transfer_status = 'REJECTED' WHERE id = NEW.reverses_movement_id;
END;

CREATE TRIGGER ledger_update_guard
BEFORE UPDATE ON ledger_movements
BEGIN
  SELECT RAISE(ABORT, 'LEDGER_IMMUTABLE_EXCEPT_TRANSFER_STATUS')
  WHERE NEW.id IS NOT OLD.id OR NEW.idempotency_key IS NOT OLD.idempotency_key
    OR NEW.client_id IS NOT OLD.client_id OR NEW.dispatch_id IS NOT OLD.dispatch_id
    OR NEW.worker_user_id IS NOT OLD.worker_user_id OR NEW.movement_type IS NOT OLD.movement_type
    OR NEW.previous_balance IS NOT OLD.previous_balance OR NEW.payment_amount IS NOT OLD.payment_amount
    OR NEW.payment_method IS NOT OLD.payment_method OR NEW.receipt_r2_key IS NOT OLD.receipt_r2_key
    OR NEW.charge_amount IS NOT OLD.charge_amount OR NEW.adjustment_amount IS NOT OLD.adjustment_amount
    OR NEW.new_balance IS NOT OLD.new_balance OR NEW.reason IS NOT OLD.reason
    OR NEW.reverses_movement_id IS NOT OLD.reverses_movement_id OR NEW.created_at IS NOT OLD.created_at;
  SELECT RAISE(ABORT, 'REJECTED_TRANSFER_IS_FINAL')
  WHERE OLD.transfer_status = 'REJECTED' AND NEW.transfer_status <> 'REJECTED';
  SELECT RAISE(ABORT, 'REJECTED_TRANSFER_REQUIRES_REVERSAL')
  WHERE NEW.transfer_status = 'REJECTED' AND NOT EXISTS (
    SELECT 1 FROM ledger_movements reversal
    WHERE reversal.reverses_movement_id = OLD.id AND reversal.movement_type = 'TRANSFER_REVERSAL'
  );
END;

CREATE TRIGGER ledger_delete_guard BEFORE DELETE ON ledger_movements
BEGIN
  SELECT RAISE(ABORT, 'LEDGER_HISTORY_CANNOT_BE_DELETED');
END;

CREATE TRIGGER movement_items_insert_guard
BEFORE INSERT ON movement_items
BEGIN
  SELECT RAISE(ABORT, 'MOVEMENT_ITEM_ALREADY_EXISTS')
  WHERE EXISTS (
    SELECT 1 FROM movement_items existing
    WHERE existing.id = NEW.id OR (existing.movement_id = NEW.movement_id AND existing.product_id = NEW.product_id)
  );
  SELECT RAISE(ABORT, 'ITEM_REQUIRES_VISIT_AND_LOADED_PRODUCT_IN_OPEN_DISPATCH')
  WHERE NOT EXISTS (
    SELECT 1 FROM ledger_movements l
    JOIN route_dispatches d ON d.id = l.dispatch_id
    JOIN dispatch_inventory i ON i.dispatch_id = l.dispatch_id AND i.product_id = NEW.product_id
    WHERE l.id = NEW.movement_id AND l.movement_type = 'VISIT' AND d.status = 'OPEN'
  );
  SELECT RAISE(ABORT, 'ITEM_TOTAL_EXCEEDS_MOVEMENT_CHARGE')
  WHERE NEW.subtotal + COALESCE((SELECT SUM(subtotal) FROM movement_items WHERE movement_id = NEW.movement_id), 0)
    > (SELECT charge_amount FROM ledger_movements WHERE id = NEW.movement_id);
END;

CREATE TRIGGER movement_items_update_guard BEFORE UPDATE ON movement_items
BEGIN
  SELECT RAISE(ABORT, 'MOVEMENT_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER movement_items_delete_guard BEFORE DELETE ON movement_items
BEGIN
  SELECT RAISE(ABORT, 'MOVEMENT_ITEMS_IMMUTABLE');
END;
```

---

## 4. Especificación de las 8 Pantallas y Flujos

### 1. Acceso Único (`/login`)
- Botón único **[Continuar con Google]** vía Firebase Auth.
- Al autenticar, el backend verifica el email del token:
  - Si es `ADMIN` $\rightarrow$ redirige a `/admin/cierre`.
  - Si es `WORKER` $\rightarrow$ redirige a `/ruta`.
  - Si el email coincide con `clients.linked_email` (o viene de escanear un token QR de vinculación) $\rightarrow$ guarda su `firebase_uid` en `clients` y redirige a `/mi-cuenta`.
  - El UID ya vinculado es la identidad estable; no se sobrescribe automáticamente al cambiar un correo. Los tokens QR de Fase 3 serán de un solo uso, con expiración y validación en servidor. Si una tarjeta ya está vinculada, el trabajador debe solicitar la corrección al administrador.
  - Durante Fase 1 se abre `/sesion` tras autenticar, una vista funcional de acceso y cierre de sesión. Los destinos comerciales se activan cuando se implementen sus pantallas en Fases 3 y 4.

### 2. Vistas del Trabajador (`/ruta`) — *100% Mobile-First*
- **Pantalla W1: Hoja de Ruta y Mi Cava (`/ruta`)**
  - **Header "Mi Carga Hoy":** Muestra el recorrido activo asignado al trabajador y píldoras con el stock restante en tiempo real (`dispatch_inventory.remaining_qty`).
  - **Filtros:** `Pendientes hoy` | `Visitados hoy` | `Todos`.
  - **Buscador rápido:** Por nombre, dirección o `#route_order`.
  - **Listado secuencial:** Tarjetas ordenadas por `route_order` mostrando `#Orden`, `Nombre`, `Dirección + Referencia` y `Saldo Actual`.
  - **Botón flotante `[+ Cliente]`:** Modal con solo 4 campos: *Nombre*, *Dirección*, *Referencia de la casa* y *Correo Gmail (Opcional)*.
- **Pantalla W2: Atención "Puerta a Puerta" (`/ruta/cliente/[id]`)**
  - Todo en una sola vista vertical sin cambiar de pestaña:
    1. **Encabezado:** `#Orden`, Nombre, Dirección/Referencia y botón `[🔗 Vincular QR/Mail]` (permite escribir el Gmail del cliente o mostrar un QR en pantalla para que el cliente escanee y enlace su Google Auth).
    2. **Saldo Anterior:** Visible en grande.
    3. **Sección 1 - Abono de Hoy:** Input numérico con botones rápidos (`[Pago Total]`, `[+$10.000]`, `[+$20.000]`), selector `Efectivo` vs `Transferencia`. Si es `Transferencia`, muestra el botón para tomar/elegir foto, la comprime a WebP en el cliente y la deja lista para subir a R2.
    4. **Sección 2 - Productos Dejados Hoy:** Lista de productos disponibles en su recorrido con botones `[-]` y `[+]`. Muestra *"Quedan X en tu recorrido"*. Si `remaining_qty == 0`, bloquea el botón `[+]`.
    5. **Footer Fijo de Confirmación:** Muestra la ecuación en vivo (`Saldo Anterior - Abono + Productos Hoy = NUEVO SALDO`) y el botón **[Guardar Visita ✓]** que ejecuta la transacción atómica en D1.
- **Pantalla W3: Mi Cuadre del Día (`/ruta/resumen`)**
  - Resumen de solo lectura para entregar cuentas al jefe: Total efectivo en mano, cantidad de transferencias registradas y lista exacta de productos físicos sobrantes que debe devolver (`initial_qty - vendidos`).

### 3. Vistas del Administrador / Jefe (`/admin`)
- **Pantalla A1: Bodega, Costos y Despacho de Recorridos (`/admin/inventario`)**
  - **Pestaña "Bodega y Costos":** CRUD de productos con `cost_price`, `credit_price`, margen de ganancia unitario y botón para sumar compras semanales a `total_stock`.
  - **Pestaña "Armar Recorridos":** Crear un recorrido (`route_dispatches`), asignar 1 o más trabajadores (`dispatch_workers`) y asignar cuántas unidades de cada producto llevan (`dispatch_inventory`). Muestra métricas claras: `Total Bodega` | `Asignado en Calle` | `Disponible en Casa`.
- **Pantalla A2: Liquidación y Conciliación de Captures (`/admin/cierre`)**
  - Selector de Recorrido del viernes.
  - **Tarjetas de Cuadre:** Efectivo total que debe entregar el trabajador, Total en Transferencias y **Sobrante físico de mercancía a devolver**.
  - **Bandeja Visual de Transferencias (R2):** Galería de tarjetas con la imagen del capture a la izquierda y detalles a la derecha (Cliente, Hora, Monto, Trabajador) con botones **[✓ Confirmar en Banco]** (`VERIFIED`) y **[✕ Observar]** (`OBSERVED`).
  - **[Rechazar definitivamente]** (`REJECTED`) requiere un motivo y registra el reverso contable; no modifica retroactivamente los importes del movimiento original.
- **Pantalla A3: Directorio Maestro de Clientes y Cartera (`/admin/clientes`)**
  - KPIs superiores: *Cartera Total en la Calle ($)* y *Ganancia Proyectada*.
  - Antes de Fase 4 se fija la fórmula de Ganancia Proyectada. Los saldos heredados sin detalle de productos no permiten inferir su ganancia. Si se requiere margen histórico, se añadirá costo histórico privado del administrador mediante una migración explícita.
  - Tabla completa de las +100 tarjetas con edición de `route_order`, ajuste de saldo inicial (para migración desde las tarjetas de cartón), edición de correo vinculado e historial completo por cliente.

### 4. Vista del Cliente (`/mi-cuenta`)
- **Pantalla C1: Mi Tarjeta Digital**
  - Muestra su Nombre, Dirección y **Saldo Pendiente Actual**.
  - Historial cronológico por cada viernes: cuánto abonó (con enlace para ver su capture de transferencia), qué productos llevó detallados por cantidad y precio, y cómo quedó su saldo tras cada visita.

---

## 5. Plan de Ejecución Paso a Paso

No generes archivos vacíos ni código incompleto. Vamos a construir el proyecto en fases ordenadas. **Empieza ahora mismo ejecutando la Fase 1 y espérame para confirmar antes de pasar a la Fase 2:**

- **Fase 1 (Base, Configuración y Esquema D1):**
  1. Estructura de carpetas del proyecto Next.js (App Router) + configuración de `wrangler.toml` con bindings para `DB` (D1) y `RECEIPTS_BUCKET` (R2).
  2. Archivo `migrations/0001_init.sql` completo + script de `seed.sql` de prueba (1 Admin, 2 Trabajadores, 5 Productos con costo y precio fiado, 1 Recorrido activo y 10 Clientes ordenados del #1 al #10 sin teléfono).
  3. Utilidad de autenticación Firebase + Middleware de verificación de roles (`ADMIN`, `WORKER`, `CLIENT`) y helper de seguridad para nunca exponer `cost_price` fuera de rutas `/api/admin/*`.
- **Fase 2 (Backend Edge API & Transacción Atómica):**
  - Endpoints para Recorridos, Visita Puerta a Puerta (`POST /api/ruta/visita` con `env.DB.batch` e idempotencia), subida de WebP a R2 y conciliación del Admin.
- **Fase 3 (Vistas del Trabajador W1, W2, W3 + Compresor WebP):**
  - Implementación completa de `/ruta`, `/ruta/cliente/[id]` (con compresor Canvas a WebP y QR de vinculación) y `/ruta/resumen`.
- **Fase 4 (Vistas del Administrador A1, A2, A3 y Portal Cliente C1):**
  - Implementación de `/admin/inventario`, `/admin/cierre`, `/admin/clientes` y `/mi-cuenta`.

La Fase 1 está terminada. El usuario aprobó el 2026-10-14 construir las Fases 2, 3 y 4 completas con pnpm y los cinco ajustes de [la propuesta aprobada](docs/propuesta-fases-2-4.md). Esa propuesta amplía la compresión excepcional, cola local, cuadre, protección de costo histórico e indicador de margen. Los contratos concretos están en [contratos API](docs/contratos-api.md); el alta ADMIN registra el saldo de la tarjeta física mediante OPENING y las correcciones posteriores son ADJUSTMENT.
