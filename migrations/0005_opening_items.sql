-- Historical products already owed when a card is created; no inventory or sale.
-- Additive rollback: docs/rollback-tarjetas-deuda-inicial.md.
CREATE TABLE opening_items (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  movement_id TEXT NOT NULL REFERENCES ledger_movements(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL CHECK (length(trim(product_name_snapshot)) > 0),
  qty INTEGER NOT NULL CHECK (typeof(qty) = 'integer' AND qty > 0 AND qty <= 100000),
  unit_credit_price INTEGER NOT NULL CHECK (typeof(unit_credit_price) = 'integer' AND unit_credit_price >= 0 AND unit_credit_price <= 1000000000),
  subtotal INTEGER NOT NULL CHECK (typeof(subtotal) = 'integer' AND subtotal >= 0 AND subtotal <= 1000000000 AND subtotal = qty * unit_credit_price),
  UNIQUE (movement_id, product_id)
);

CREATE TRIGGER opening_items_insert_guard
BEFORE INSERT ON opening_items
BEGIN
  -- Reject REPLACE before SQLite can remove an immutable historical line.
  SELECT RAISE(ABORT, 'OPENING_ITEM_ALREADY_EXISTS')
  WHERE EXISTS (
    SELECT 1 FROM opening_items existing
    WHERE existing.id = NEW.id OR (existing.movement_id = NEW.movement_id AND existing.product_id = NEW.product_id)
  );
  SELECT RAISE(ABORT, 'OPENING_ITEM_REQUIRES_OPENING')
  WHERE NOT EXISTS (
    SELECT 1 FROM ledger_movements m WHERE m.id = NEW.movement_id AND m.movement_type = 'OPENING'
  );
  SELECT RAISE(ABORT, 'OPENING_ITEM_TOTAL_EXCEEDS_BALANCE')
  WHERE NEW.subtotal + COALESCE((SELECT SUM(subtotal) FROM opening_items WHERE movement_id = NEW.movement_id), 0)
    > (SELECT adjustment_amount FROM ledger_movements WHERE id = NEW.movement_id);
END;

CREATE TRIGGER opening_items_update_guard BEFORE UPDATE ON opening_items
BEGIN
  SELECT RAISE(ABORT, 'OPENING_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER opening_items_delete_guard BEFORE DELETE ON opening_items
BEGIN
  SELECT RAISE(ABORT, 'OPENING_ITEMS_IMMUTABLE');
END;
