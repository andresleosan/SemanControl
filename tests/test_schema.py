"""Contract tests against real SQLite; no Cloudflare credentials are required."""

from pathlib import Path
import sqlite3
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0001_init.sql"
SEED = ROOT / "seed.sql"


class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MIGRATION.is_file(), "Falta la migración D1 0001_init.sql")
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.db.execute(
            "INSERT INTO users(id,email,name,role) VALUES ('admin','admin@example.test','Admin','ADMIN')"
        )
        self.db.execute(
            "INSERT INTO users(id,email,name,role) VALUES ('worker','worker@example.test','Worker','WORKER')"
        )
        self.db.execute(
            "INSERT INTO clients(id,name,address,address_reference,route_order) "
            "VALUES ('client','Cliente','Calle 1','Puerta verde',1)"
        )
        self.db.execute(
            "INSERT INTO products(id,name,cost_price,credit_price,total_stock) "
            "VALUES ('product','Producto',500,1000,10)"
        )
        self.db.execute(
            "INSERT INTO route_dispatches(id,dispatch_date,name) VALUES ('route','2026-10-16','Ruta')"
        )
        self.db.execute("INSERT INTO dispatch_workers VALUES ('route','worker')")
        self.db.execute(
            "INSERT INTO dispatch_inventory VALUES ('inventory','route','product',6,6)"
        )
        self.db.commit()

    def invalid(self, statement, parameters=()):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(statement, parameters)

    def movement(self, **changes):
        row = {
            "id": "visit",
            "idempotency_key": "visit-key",
            "client_id": "client",
            "dispatch_id": "route",
            "worker_user_id": "worker",
            "movement_type": "VISIT",
            "previous_balance": 0,
            "payment_amount": 0,
            "payment_method": "NONE",
            "receipt_r2_key": None,
            "transfer_status": "NOT_APPLICABLE",
            "charge_amount": 0,
            "adjustment_amount": 0,
            "new_balance": 0,
            "reason": None,
            "reverses_movement_id": None,
        }
        row.update(changes)
        self.db.execute(
            f"INSERT INTO ledger_movements ({','.join(row)}) VALUES ({','.join('?' for _ in row)})",
            tuple(row.values()),
        )

    def transfer(self):
        self.movement(
            payment_amount=3000,
            payment_method="TRANSFER",
            receipt_r2_key="receipts/synthetic.webp",
            transfer_status="PENDING",
            previous_balance=5000,
            new_balance=2000,
        )

    def reversal(self, **changes):
        values = dict(
            id="reversal", idempotency_key="reversal-key", dispatch_id=None,
            worker_user_id="admin", movement_type="TRANSFER_REVERSAL",
            previous_balance=2000, adjustment_amount=3000, new_balance=5000,
            reason="Transferencia no recibida", reverses_movement_id="visit",
        )
        values.update(changes)
        self.movement(**values)

    def second_route(self, quantity=4):
        self.db.execute(
            "INSERT INTO route_dispatches(id,dispatch_date,name) VALUES ('route2','2026-10-16','Ruta 2')"
        )
        self.db.execute(
            "INSERT INTO dispatch_inventory VALUES ('inventory2','route2','product',?,?)",
            (quantity, quantity),
        )

    def test_user_is_active_by_default_and_email_is_canonical(self):
        self.assertEqual(self.db.execute("SELECT is_active FROM users WHERE id='worker'").fetchone()[0], 1)
        self.invalid("UPDATE users SET email='Worker@Example.test' WHERE id='worker'")
        self.invalid("UPDATE users SET email=' worker@example.test ' WHERE id='worker'")
        self.invalid("UPDATE users SET is_active=2 WHERE id='worker'")

    def test_identity_links_are_unique(self):
        self.db.execute("UPDATE users SET firebase_uid='uid' WHERE id='admin'")
        self.invalid("UPDATE users SET firebase_uid='uid' WHERE id='worker'")
        self.invalid("UPDATE users SET email='admin@example.test' WHERE id='worker'")

    def test_client_reference_and_route_order_are_required_and_unique(self):
        self.invalid("UPDATE clients SET address_reference=NULL WHERE id='client'")
        self.invalid("UPDATE clients SET address_reference='   ' WHERE id='client'")
        self.invalid("UPDATE clients SET route_order=1.5 WHERE id='client'")
        self.invalid("UPDATE clients SET route_order=0 WHERE id='client'")
        self.invalid(
            "INSERT INTO clients(id,name,address,address_reference,route_order) VALUES ('duplicate','B','C','D',1)"
        )
        self.invalid("UPDATE clients SET linked_email='User@Example.test' WHERE id='client'")

    def test_integer_money_and_nonnegative_stock_are_enforced(self):
        for column, value in (("cost_price", -1), ("credit_price", 1.25), ("total_stock", -1), ("total_stock", 7.5)):
            with self.subTest(column=column, value=value):
                self.invalid(f"UPDATE products SET {column}=? WHERE id='product'", (value,))
        self.invalid("UPDATE clients SET current_balance=0.5 WHERE id='client'")

    def test_inventory_quantity_bounds_and_integer_type_are_enforced(self):
        for assignment in ("initial_qty=-1", "remaining_qty=-1", "remaining_qty=7", "remaining_qty=2.5"):
            with self.subTest(assignment=assignment):
                self.invalid(f"UPDATE dispatch_inventory SET {assignment} WHERE id='inventory'")

    def test_foreign_keys_and_unique_route_product_are_enforced(self):
        self.invalid("INSERT INTO dispatch_inventory VALUES ('bad','missing','product',1,1)")
        self.invalid("INSERT INTO dispatch_inventory VALUES ('duplicate','route','product',1,1)")
        self.invalid("DELETE FROM products WHERE id='product'")

    def test_only_active_workers_can_be_assigned(self):
        self.invalid("INSERT INTO dispatch_workers VALUES ('route','admin')")
        self.db.execute("UPDATE users SET is_active=0 WHERE id='worker'")
        self.db.execute("INSERT INTO route_dispatches(id,dispatch_date,name) VALUES ('other','2026-10-16','Otra')")
        self.invalid("INSERT INTO dispatch_workers VALUES ('other','worker')")

    def test_two_routes_cannot_overallocate_a_product(self):
        self.second_route()
        self.db.execute("INSERT INTO route_dispatches(id,dispatch_date,name) VALUES ('route3','2026-10-16','Ruta 3')")
        self.invalid("INSERT INTO dispatch_inventory VALUES ('inventory3','route3','product',1,1)")
        self.assertEqual(self.db.execute("SELECT SUM(remaining_qty) FROM dispatch_inventory").fetchone()[0], 10)

    def test_reservation_update_cannot_overallocate(self):
        self.second_route()
        self.invalid("UPDATE dispatch_inventory SET initial_qty=7,remaining_qty=7 WHERE id='inventory'")
        self.assertEqual(self.db.execute("SELECT remaining_qty FROM dispatch_inventory WHERE id='inventory'").fetchone()[0], 6)

    def test_stock_reduction_cannot_consume_reserved_units(self):
        self.invalid("UPDATE products SET total_stock=5 WHERE id='product'")

    def test_replace_cannot_reduce_stock_below_existing_reservations(self):
        self.second_route()
        self.invalid(
            "INSERT OR REPLACE INTO products(id,name,cost_price,credit_price,total_stock) "
            "VALUES ('product','Producto sustituido',500,1000,0)"
        )
        self.assertEqual(self.db.execute("SELECT total_stock FROM products WHERE id='product'").fetchone()[0], 10)
        self.assertEqual(self.db.execute("SELECT SUM(remaining_qty) FROM dispatch_inventory").fetchone()[0], 10)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_delivery_batch_decrements_reservation_then_total_stock(self):
        self.second_route()
        with self.db:
            self.db.execute("UPDATE dispatch_inventory SET remaining_qty=remaining_qty-2 WHERE id='inventory'")
            self.db.execute("UPDATE products SET total_stock=total_stock-2 WHERE id='product'")
            self.db.execute("UPDATE clients SET current_balance=2000 WHERE id='client'")
            self.movement(charge_amount=2000, new_balance=2000)
            self.db.execute("INSERT INTO movement_items VALUES ('item','visit','product','Producto',2,1000,2000)")
        self.assertEqual(self.db.execute("SELECT remaining_qty FROM dispatch_inventory WHERE id='inventory'").fetchone()[0], 4)
        self.assertEqual(self.db.execute("SELECT total_stock FROM products WHERE id='product'").fetchone()[0], 8)
        self.assertEqual(self.db.execute("SELECT current_balance FROM clients WHERE id='client'").fetchone()[0], 2000)

    def test_failed_delivery_transaction_rolls_back_prior_updates(self):
        self.movement()
        self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("UPDATE dispatch_inventory SET remaining_qty=4 WHERE id='inventory'")
                self.db.execute("UPDATE products SET total_stock=8 WHERE id='product'")
                self.db.execute("UPDATE clients SET current_balance=2000 WHERE id='client'")
                self.movement(id="second", charge_amount=2000, new_balance=2000)
        self.assertEqual(self.db.execute("SELECT remaining_qty FROM dispatch_inventory WHERE id='inventory'").fetchone()[0], 6)
        self.assertEqual(self.db.execute("SELECT total_stock FROM products WHERE id='product'").fetchone()[0], 10)
        self.assertEqual(self.db.execute("SELECT current_balance FROM clients WHERE id='client'").fetchone()[0], 0)

    def test_closing_preserves_surplus_and_releases_reservation(self):
        self.db.execute("UPDATE route_dispatches SET status='CLOSED' WHERE id='route'")
        self.second_route(quantity=10)
        self.assertEqual(self.db.execute("SELECT remaining_qty FROM dispatch_inventory WHERE id='inventory'").fetchone()[0], 6)
        self.invalid("UPDATE route_dispatches SET status='OPEN' WHERE id='route'")

    def test_replace_cannot_reopen_closed_route(self):
        self.db.execute("UPDATE route_dispatches SET status='CLOSED' WHERE id='route'")
        self.second_route(quantity=10)
        self.invalid(
            "INSERT OR REPLACE INTO route_dispatches(id,dispatch_date,name,status) "
            "VALUES ('route','2026-10-16','Ruta sustituida','OPEN')"
        )
        self.assertEqual(self.db.execute("SELECT status FROM route_dispatches WHERE id='route'").fetchone()[0], "CLOSED")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_replace_cannot_reassign_closed_inventory_history(self):
        self.db.execute("UPDATE route_dispatches SET status='CLOSED' WHERE id='route'")
        self.db.execute("INSERT INTO route_dispatches(id,dispatch_date,name) VALUES ('route2','2026-10-16','Ruta 2')")
        self.invalid("INSERT OR REPLACE INTO dispatch_inventory VALUES ('inventory','route2','product',1,1)")
        self.assertEqual(self.db.execute("SELECT dispatch_id,remaining_qty FROM dispatch_inventory WHERE id='inventory'").fetchone(), ("route", 6))

    def test_closed_route_rejects_deliveries_and_inventory_mutation(self):
        self.db.execute("UPDATE route_dispatches SET status='CLOSED' WHERE id='route'")
        self.invalid("UPDATE dispatch_inventory SET remaining_qty=5 WHERE id='inventory'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.movement()

    def test_closed_route_rejects_late_movement_items(self):
        self.movement(charge_amount=1000, new_balance=1000)
        self.db.execute("UPDATE route_dispatches SET status='CLOSED' WHERE id='route'")
        self.invalid("INSERT INTO movement_items VALUES ('item','visit','product','Producto',1,1000,1000)")

    def test_missing_update_is_zero_rows_not_transaction_failure(self):
        with self.db:
            result = self.db.execute("UPDATE dispatch_inventory SET remaining_qty=remaining_qty-1 WHERE id='missing'")
        self.assertEqual(result.rowcount, 0)
        self.assertEqual(self.db.execute("SELECT total_stock FROM products WHERE id='product'").fetchone()[0], 10)

    def test_ledger_equation_and_integer_amounts_are_enforced(self):
        for changes in (dict(new_balance=1), dict(payment_amount=-1, new_balance=1), dict(charge_amount=0.5, new_balance=0.5)):
            with self.subTest(changes=changes), self.assertRaises(sqlite3.IntegrityError):
                self.movement(**changes)

    def test_overpayment_is_recorded_as_credit_balance(self):
        self.movement(previous_balance=1000, payment_amount=2000, payment_method="CASH", new_balance=-1000)
        self.assertEqual(self.db.execute("SELECT new_balance FROM ledger_movements").fetchone()[0], -1000)

    def test_visit_requires_open_route_and_assigned_worker(self):
        for changes in (dict(dispatch_id=None), dict(worker_user_id="admin")):
            with self.subTest(changes=changes), self.assertRaises(sqlite3.IntegrityError):
                self.movement(**changes)

    def test_opening_requires_admin_reason_and_only_one_per_client(self):
        opening = dict(movement_type="OPENING", dispatch_id=None, worker_user_id="admin", adjustment_amount=65000, new_balance=65000, reason="Migración tarjeta")
        for changes in (dict(worker_user_id="worker"), dict(reason=" "), dict(previous_balance=1, new_balance=65001)):
            with self.subTest(changes=changes), self.assertRaises(sqlite3.IntegrityError):
                self.movement(**(opening | changes))
        self.movement(**opening)
        with self.assertRaises(sqlite3.IntegrityError):
            self.movement(**(opening | dict(id="opening2", idempotency_key="opening2-key")))

    def test_signed_adjustment_requires_admin_and_reason(self):
        adjustment = dict(movement_type="ADJUSTMENT", dispatch_id=None, worker_user_id="admin", previous_balance=5000, adjustment_amount=-1000, new_balance=4000, reason="Corrección documentada")
        self.movement(**adjustment)
        self.assertEqual(self.db.execute("SELECT adjustment_amount FROM ledger_movements").fetchone()[0], -1000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.movement(**(adjustment | dict(id="bad", idempotency_key="bad", reason=None)))

    def test_transfer_requires_receipt_and_valid_status(self):
        for changes in (dict(payment_amount=1, payment_method="TRANSFER", new_balance=-1), dict(payment_amount=1, payment_method="NONE", new_balance=-1), dict(transfer_status="PENDING")):
            with self.subTest(changes=changes), self.assertRaises(sqlite3.IntegrityError):
                self.movement(**changes)

    def test_verifying_transfer_does_not_discount_twice(self):
        self.transfer()
        self.db.execute("UPDATE ledger_movements SET transfer_status='VERIFIED' WHERE id='visit'")
        self.assertEqual(self.db.execute("SELECT payment_amount,new_balance FROM ledger_movements").fetchone(), (3000, 2000))

    def test_rejected_transfer_requires_a_unique_traceable_reversal(self):
        self.transfer()
        self.invalid("UPDATE ledger_movements SET transfer_status='REJECTED' WHERE id='visit'")
        self.reversal()
        self.assertEqual(self.db.execute("SELECT transfer_status FROM ledger_movements WHERE id='visit'").fetchone()[0], "REJECTED")
        self.assertEqual(self.db.execute("SELECT adjustment_amount,reverses_movement_id FROM ledger_movements WHERE id='reversal'").fetchone(), (3000, "visit"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.reversal(id="duplicate", idempotency_key="duplicate")
        self.invalid("UPDATE ledger_movements SET transfer_status='VERIFIED' WHERE id='visit'")

    def test_reversal_must_match_payment_client_and_admin(self):
        self.transfer()
        for changes in (dict(adjustment_amount=2000, new_balance=4000), dict(worker_user_id="worker"), dict(reverses_movement_id="missing")):
            with self.subTest(changes=changes), self.assertRaises(sqlite3.IntegrityError):
                self.reversal(**changes)

    def test_ledger_and_items_keep_audit_history_immutable(self):
        self.movement(charge_amount=1000, new_balance=1000)
        self.db.execute("INSERT INTO movement_items VALUES ('item','visit','product','Producto',1,1000,1000)")
        self.invalid("UPDATE ledger_movements SET reason='altered' WHERE id='visit'")
        self.invalid("DELETE FROM ledger_movements WHERE id='visit'")
        self.invalid("UPDATE movement_items SET qty=2,subtotal=2000 WHERE id='item'")
        self.invalid("DELETE FROM movement_items WHERE id='item'")

    def test_replace_cannot_overwrite_ledger_audit_history(self):
        self.movement()
        for movement_id, idempotency_key in (("visit", "new-key"), ("new-visit", "visit-key")):
            with self.subTest(movement_id=movement_id, idempotency_key=idempotency_key):
                self.invalid(
                    "INSERT OR REPLACE INTO ledger_movements(id,idempotency_key,client_id,dispatch_id,worker_user_id,previous_balance,new_balance) "
                    "VALUES (?,?,'client','route','worker',100,100)",
                    (movement_id, idempotency_key),
                )
        self.assertEqual(self.db.execute("SELECT id,idempotency_key,previous_balance FROM ledger_movements").fetchall(), [("visit", "visit-key", 0)])

    def test_replace_cannot_overwrite_item_audit_history(self):
        self.movement(charge_amount=5000, new_balance=5000)
        self.db.execute("INSERT INTO movement_items VALUES ('item','visit','product','Producto',1,1000,1000)")
        self.invalid("INSERT OR REPLACE INTO movement_items VALUES ('item','visit','product','Alterado',2,1000,2000)")
        self.invalid("INSERT OR REPLACE INTO movement_items VALUES ('new-item','visit','product','Alterado',2,1000,2000)")
        self.assertEqual(self.db.execute("SELECT product_name_snapshot FROM movement_items WHERE id='item'").fetchone()[0], "Producto")

    def test_item_quantity_subtotal_and_charge_bound_are_enforced(self):
        self.movement(charge_amount=1000, new_balance=1000)
        for qty, price, subtotal in ((0, 1000, 0), (1.5, 1000, 1500), (1, -1, -1), (1, 1000, 999), (2, 1000, 2000)):
            with self.subTest(qty=qty, price=price, subtotal=subtotal):
                self.invalid("INSERT INTO movement_items VALUES ('item','visit','product','Producto',?,?,?)", (qty, price, subtotal))
        self.db.execute("INSERT INTO movement_items VALUES ('item','visit','product','Producto',1,1000,1000)")
        self.invalid("INSERT INTO movement_items VALUES ('item2','visit','product','Producto',1,1000,1000)")

    def test_seed_is_exact_auditable_and_repeatable(self):
        self.assertTrue(SEED.is_file(), "Falta seed.sql reproducible")
        fresh = sqlite3.connect(":memory:")
        self.addCleanup(fresh.close)
        fresh.execute("PRAGMA foreign_keys = ON")
        fresh.executescript(MIGRATION.read_text(encoding="utf-8"))
        seed = SEED.read_text(encoding="utf-8")
        fresh.executescript(seed)
        self.assertEqual(fresh.execute("SELECT role,COUNT(*) FROM users GROUP BY role ORDER BY role").fetchall(), [("ADMIN", 1), ("WORKER", 2)])
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM products").fetchone()[0], 5)
        self.assertEqual(fresh.execute("SELECT status,COUNT(*) FROM route_dispatches GROUP BY status").fetchall(), [("OPEN", 1)])
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM dispatch_workers").fetchone()[0], 2)
        self.assertEqual(fresh.execute("SELECT route_order FROM clients ORDER BY route_order").fetchall(), [(i,) for i in range(1, 11)])
        self.assertNotIn("phone", {row[1] for row in fresh.execute("PRAGMA table_info(clients)")})
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM ledger_movements WHERE movement_type='OPENING' AND reason IS NOT NULL").fetchone()[0], 10)
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM ledger_movements l JOIN clients c ON c.id=l.client_id JOIN users u ON u.id=l.worker_user_id WHERE l.new_balance=c.current_balance AND l.previous_balance=0 AND u.role='ADMIN'").fetchone()[0], 10)
        self.assertEqual(fresh.execute("PRAGMA foreign_key_check").fetchall(), [])
        fresh.execute("INSERT INTO clients(id,name,address,address_reference,route_order) VALUES ('client-demo-99','Otra tarjeta','Calle 99','Puerta 99',99)")
        fresh.executescript(seed)
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM clients").fetchone()[0], 11)
        self.assertEqual(fresh.execute("SELECT COUNT(*) FROM ledger_movements").fetchone()[0], 10)

    def test_backup_restores_schema_and_audit_records(self):
        self.movement()
        self.db.commit()
        with tempfile.TemporaryDirectory() as temporary:
            backup = sqlite3.connect(str(Path(temporary) / "backup.sqlite"))
            try:
                self.db.backup(backup)
                restored = sqlite3.connect(":memory:")
                try:
                    backup.backup(restored)
                    self.assertEqual(restored.execute("SELECT COUNT(*) FROM ledger_movements").fetchone()[0], 1)
                    self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                finally:
                    restored.close()
            finally:
                backup.close()


if __name__ == "__main__":
    unittest.main()
