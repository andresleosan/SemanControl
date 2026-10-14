-- Operational schema. Rollback: docs/rollback-fases-2-4.md.
-- Existing imports may leave client_sequence NULL; all new business writes
-- provide revision + 1. Legacy history is backfilled before adding its index.
ALTER TABLE clients ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0);
ALTER TABLE ledger_movements ADD COLUMN client_sequence INTEGER CHECK (client_sequence IS NULL OR (typeof(client_sequence) = 'integer' AND client_sequence > 0));
ALTER TABLE ledger_movements ADD COLUMN request_hash TEXT;
ALTER TABLE movement_items ADD COLUMN unit_cost_price INTEGER CHECK (unit_cost_price IS NULL OR (typeof(unit_cost_price) = 'integer' AND unit_cost_price >= 0));
ALTER TABLE dispatch_workers ADD COLUMN pending_sync_confirmed_at TEXT;

UPDATE ledger_movements SET client_sequence = (
  SELECT COUNT(*) FROM ledger_movements preceding
  WHERE preceding.client_id = ledger_movements.client_id
    AND (preceding.created_at < ledger_movements.created_at OR (preceding.created_at = ledger_movements.created_at AND preceding.id <= ledger_movements.id))
);
UPDATE clients SET revision = COALESCE((SELECT MAX(client_sequence) FROM ledger_movements WHERE client_id = clients.id), 0);
CREATE UNIQUE INDEX idx_ledger_client_sequence ON ledger_movements(client_id, client_sequence) WHERE client_sequence IS NOT NULL;

CREATE TABLE operation_guards (
  id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1)
);
CREATE TABLE operation_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  previous_json TEXT,
  next_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE INDEX idx_audit_entity ON audit_events(entity_id, created_at, id);
CREATE TABLE stock_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (typeof(delta) = 'integer'),
  previous_stock INTEGER NOT NULL CHECK (typeof(previous_stock) = 'integer' AND previous_stock >= 0),
  new_stock INTEGER NOT NULL CHECK (typeof(new_stock) = 'integer' AND new_stock >= 0 AND new_stock = previous_stock + delta),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE dispatch_closures (
  dispatch_id TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL,
  expected_cash INTEGER NOT NULL CHECK (typeof(expected_cash) = 'integer' AND expected_cash >= 0),
  received_cash INTEGER NOT NULL CHECK (typeof(received_cash) = 'integer' AND received_cash >= 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dispatch_id) REFERENCES route_dispatches(id),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);
CREATE TABLE dispatch_returns (
  dispatch_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  expected_qty INTEGER NOT NULL CHECK (typeof(expected_qty) = 'integer' AND expected_qty >= 0),
  received_qty INTEGER NOT NULL CHECK (typeof(received_qty) = 'integer' AND received_qty >= 0),
  PRIMARY KEY (dispatch_id, product_id),
  FOREIGN KEY (dispatch_id) REFERENCES dispatch_closures(dispatch_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE receipts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  r2_key TEXT UNIQUE NOT NULL,
  file_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (typeof(byte_size) = 'integer' AND byte_size > 0 AND byte_size <= 512000),
  width INTEGER NOT NULL CHECK (typeof(width) = 'integer' AND width BETWEEN 1 AND 1600),
  height INTEGER NOT NULL CHECK (typeof(height) = 'integer' AND height BETWEEN 1 AND 1600),
  movement_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (dispatch_id) REFERENCES route_dispatches(id),
  FOREIGN KEY (movement_id) REFERENCES ledger_movements(id)
);
CREATE INDEX idx_receipts_orphans ON receipts(created_at) WHERE movement_id IS NULL;
CREATE TRIGGER receipts_insert_identity_guard
BEFORE INSERT ON receipts
WHEN EXISTS (SELECT 1 FROM receipts WHERE id = NEW.id OR r2_key = NEW.r2_key OR (NEW.movement_id IS NOT NULL AND movement_id = NEW.movement_id))
BEGIN
  SELECT RAISE(ABORT, 'RECEIPT_ID_ALREADY_EXISTS');
END;
CREATE TABLE link_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE app_secrets (
  name TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TRIGGER ledger_operational_fields_immutable
BEFORE UPDATE ON ledger_movements
WHEN NEW.client_sequence IS NOT OLD.client_sequence OR NEW.request_hash IS NOT OLD.request_hash
BEGIN
  SELECT RAISE(ABORT, 'LEDGER_OPERATIONAL_FIELDS_IMMUTABLE');
END;
CREATE TRIGGER dispatch_inventory_frozen_insert
BEFORE INSERT ON dispatch_inventory
WHEN EXISTS (SELECT 1 FROM ledger_movements WHERE dispatch_id = NEW.dispatch_id AND movement_type = 'VISIT')
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_LOAD_FROZEN');
END;
CREATE TRIGGER dispatch_inventory_frozen_initial
BEFORE UPDATE OF initial_qty ON dispatch_inventory
WHEN NEW.initial_qty <> OLD.initial_qty AND EXISTS (SELECT 1 FROM ledger_movements WHERE dispatch_id = OLD.dispatch_id AND movement_type = 'VISIT')
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_LOAD_FROZEN');
END;
CREATE TRIGGER dispatch_inventory_frozen_delete
BEFORE DELETE ON dispatch_inventory
WHEN EXISTS (SELECT 1 FROM ledger_movements WHERE dispatch_id = OLD.dispatch_id AND movement_type = 'VISIT')
BEGIN
  SELECT RAISE(ABORT, 'DISPATCH_LOAD_FROZEN');
END;
CREATE TRIGGER receipts_identity_and_association_guard
BEFORE UPDATE ON receipts
BEGIN
  SELECT RAISE(ABORT, 'RECEIPT_CLEANUP_IN_PROGRESS')
  WHERE NEW.movement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM operation_guards WHERE id = 'receipt-cleanup:' || OLD.id
  );
  SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE')
  WHERE NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id
    OR NEW.client_id IS NOT OLD.client_id OR NEW.dispatch_id IS NOT OLD.dispatch_id
    OR NEW.r2_key IS NOT OLD.r2_key OR NEW.file_hash IS NOT OLD.file_hash
    OR NEW.byte_size IS NOT OLD.byte_size OR NEW.width IS NOT OLD.width
    OR NEW.height IS NOT OLD.height OR NEW.created_at IS NOT OLD.created_at
    OR (OLD.movement_id IS NOT NULL AND NEW.movement_id IS NOT OLD.movement_id);
  SELECT RAISE(ABORT, 'RECEIPT_MOVEMENT_MISMATCH')
  WHERE NEW.movement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ledger_movements m WHERE m.id = NEW.movement_id
      AND m.client_id = NEW.client_id AND m.dispatch_id = NEW.dispatch_id
      AND m.worker_user_id = NEW.owner_user_id AND m.receipt_r2_key = NEW.r2_key
      AND m.payment_method = 'TRANSFER'
  );
END;
CREATE TRIGGER receipts_associated_delete_guard
BEFORE DELETE ON receipts
WHEN OLD.movement_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'ASSOCIATED_RECEIPT_IMMUTABLE');
END;

CREATE TRIGGER audit_events_insert_identity_guard
BEFORE INSERT ON audit_events
WHEN EXISTS (SELECT 1 FROM audit_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_ID_ALREADY_EXISTS');
END;
CREATE TRIGGER audit_events_update_guard BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_HISTORY_IMMUTABLE');
END;
CREATE TRIGGER audit_events_delete_guard BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_HISTORY_IMMUTABLE');
END;
CREATE TRIGGER stock_events_insert_identity_guard
BEFORE INSERT ON stock_events
WHEN EXISTS (SELECT 1 FROM stock_events WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'STOCK_EVENT_ID_ALREADY_EXISTS');
END;
CREATE TRIGGER stock_events_update_guard BEFORE UPDATE ON stock_events
BEGIN
  SELECT RAISE(ABORT, 'STOCK_HISTORY_IMMUTABLE');
END;
CREATE TRIGGER stock_events_delete_guard BEFORE DELETE ON stock_events
BEGIN
  SELECT RAISE(ABORT, 'STOCK_HISTORY_IMMUTABLE');
END;
