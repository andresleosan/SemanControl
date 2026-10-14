-- Synthetic local data only. Stable IDs make reruns insert-only and idempotent.
-- Never run this fixture against production; real Google emails are configured
-- by an administrator before testing Google Sign-In.

WITH fixture(id, email, name, role) AS (VALUES
  ('admin-demo', 'admin@semancontrol.example', 'Administrador de prueba', 'ADMIN'),
  ('worker-demo-1', 'trabajador1@semancontrol.example', 'Trabajador de prueba 1', 'WORKER'),
  ('worker-demo-2', 'trabajador2@semancontrol.example', 'Trabajador de prueba 2', 'WORKER')
)
INSERT INTO users(id, email, name, role, created_at)
SELECT id, email, name, role, '2026-10-14 00:00:00' FROM fixture
WHERE NOT EXISTS (SELECT 1 FROM users existing WHERE existing.id = fixture.id);

WITH fixture(id, name, cost_price, credit_price, total_stock) AS (VALUES
  ('product-demo-1', 'Arroz de prueba 1 kg', 3200, 5000, 100),
  ('product-demo-2', 'Aceite de prueba 1 L', 6800, 10000, 60),
  ('product-demo-3', 'Azúcar de prueba 1 kg', 2700, 4500, 80),
  ('product-demo-4', 'Café de prueba 250 g', 5500, 8000, 50),
  ('product-demo-5', 'Jabón de prueba', 2100, 3500, 120)
)
INSERT INTO products(id, name, cost_price, credit_price, total_stock, created_at)
SELECT id, name, cost_price, credit_price, total_stock, '2026-10-14 00:00:00' FROM fixture
WHERE NOT EXISTS (SELECT 1 FROM products existing WHERE existing.id = fixture.id);

INSERT INTO route_dispatches(id, dispatch_date, name, created_at)
SELECT 'route-demo-2026-10-16', '2026-10-16', 'Recorrido sintético del viernes', '2026-10-14 00:00:00'
WHERE NOT EXISTS (SELECT 1 FROM route_dispatches WHERE id = 'route-demo-2026-10-16');

INSERT INTO dispatch_workers(dispatch_id, worker_user_id)
SELECT 'route-demo-2026-10-16', id FROM users
WHERE id IN ('worker-demo-1', 'worker-demo-2') AND NOT EXISTS (
  SELECT 1 FROM dispatch_workers existing
  WHERE existing.dispatch_id = 'route-demo-2026-10-16' AND existing.worker_user_id = users.id
);

WITH fixture(id, product_id, quantity) AS (VALUES
  ('inventory-demo-1', 'product-demo-1', 30),
  ('inventory-demo-2', 'product-demo-2', 20),
  ('inventory-demo-3', 'product-demo-3', 25),
  ('inventory-demo-4', 'product-demo-4', 15),
  ('inventory-demo-5', 'product-demo-5', 40)
)
INSERT INTO dispatch_inventory(id, dispatch_id, product_id, initial_qty, remaining_qty)
SELECT id, 'route-demo-2026-10-16', product_id, quantity, quantity FROM fixture
WHERE NOT EXISTS (SELECT 1 FROM dispatch_inventory existing WHERE existing.id = fixture.id);

WITH fixture(id, name, address, address_reference, route_order, linked_email, current_balance) AS (VALUES
  ('client-demo-01', 'Cliente de prueba 01', 'Calle de prueba 1 # 1-01', 'Reja verde, primer piso', 1, 'cliente01@semancontrol.example', 65000),
  ('client-demo-02', 'Cliente de prueba 02', 'Calle de prueba 1 # 1-02', 'Puerta azul, primer piso', 2, NULL, 42000),
  ('client-demo-03', 'Cliente de prueba 03', 'Calle de prueba 1 # 1-03', 'Casa amarilla, entrada lateral', 3, NULL, 18000),
  ('client-demo-04', 'Cliente de prueba 04', 'Calle de prueba 1 # 1-04', 'Reja negra, segundo piso', 4, NULL, 0),
  ('client-demo-05', 'Cliente de prueba 05', 'Calle de prueba 1 # 1-05', 'Puerta blanca, junto al árbol', 5, NULL, 95000),
  ('client-demo-06', 'Cliente de prueba 06', 'Calle de prueba 1 # 1-06', 'Casa de ladrillo, primer piso', 6, NULL, 27500),
  ('client-demo-07', 'Cliente de prueba 07', 'Calle de prueba 1 # 1-07', 'Puerta roja, entrada principal', 7, NULL, 5000),
  ('client-demo-08', 'Cliente de prueba 08', 'Calle de prueba 1 # 1-08', 'Reja gris, segundo piso', 8, NULL, 33000),
  ('client-demo-09', 'Cliente de prueba 09', 'Calle de prueba 1 # 1-09', 'Casa blanca, entrada lateral', 9, NULL, 12000),
  ('client-demo-10', 'Cliente de prueba 10', 'Calle de prueba 1 # 1-10', 'Puerta café, primer piso', 10, NULL, -5000)
)
INSERT INTO clients(id, name, address, address_reference, route_order, linked_email, current_balance, created_at)
SELECT id, name, address, address_reference, route_order, linked_email, current_balance, '2026-10-14 00:00:00' FROM fixture
WHERE NOT EXISTS (SELECT 1 FROM clients existing WHERE existing.id = fixture.id);

-- Every imported balance, including zero/credit, has an opening and an author.
INSERT INTO ledger_movements(
  id, idempotency_key, client_id, worker_user_id, movement_type,
  previous_balance, adjustment_amount, new_balance, reason, created_at
)
SELECT 'opening-' || id,
  '00000000-0000-4000-8000-' || printf('%012d', route_order),
  id, 'admin-demo', 'OPENING', 0, current_balance, current_balance,
  'Apertura sintética de tarjeta de prueba; no representa deuda real', '2026-10-14 00:00:00'
FROM clients
WHERE id IN (
  'client-demo-01', 'client-demo-02', 'client-demo-03', 'client-demo-04', 'client-demo-05',
  'client-demo-06', 'client-demo-07', 'client-demo-08', 'client-demo-09', 'client-demo-10'
) AND NOT EXISTS (
  SELECT 1 FROM ledger_movements existing WHERE existing.id = 'opening-' || clients.id
);
