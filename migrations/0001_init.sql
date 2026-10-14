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
