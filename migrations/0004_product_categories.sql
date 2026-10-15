-- Optional product families; each products.id remains the sellable variant.
-- Existing product IDs, stock, prices and immutable history remain unchanged.
-- Rollback: docs/rollback-bodega-variantes.md.
CREATE TABLE product_categories (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 140),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES product_categories(id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE UNIQUE INDEX idx_products_category_variant_name
ON products(category_id, trim(name) COLLATE NOCASE) WHERE category_id IS NOT NULL;

CREATE TRIGGER product_categories_insert_identity_guard
BEFORE INSERT ON product_categories
WHEN EXISTS (SELECT 1 FROM product_categories WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_CATEGORY_ID_ALREADY_EXISTS');
END;
