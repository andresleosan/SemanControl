-- Late physical operations stay separate from visits in a closed dispatch.
-- Rollback: restore the verified pre-migration export; see rollback-fases-2-4.md.
CREATE TABLE operation_incidents (
 id TEXT PRIMARY KEY NOT NULL,
 worker_user_id TEXT NOT NULL REFERENCES users(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 dispatch_id TEXT NOT NULL REFERENCES route_dispatches(id),
 payload_json TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 file_hash TEXT,
 receipt_r2_key TEXT,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','RESOLVED')),
 resolution_note TEXT,
 adjustment_id TEXT REFERENCES ledger_movements(id),
 resolved_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 resolved_at TEXT,
 CHECK((status='OPEN' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status='RESOLVED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND length(trim(resolution_note))>0))
);
CREATE INDEX idx_incidents_dispatch ON operation_incidents(dispatch_id,status,created_at);
CREATE TRIGGER incidents_identity_guard BEFORE INSERT ON operation_incidents
WHEN EXISTS(SELECT 1 FROM operation_incidents WHERE id=NEW.id)
BEGIN
 SELECT RAISE(ABORT,'INCIDENT_EXISTS');
END;
CREATE TRIGGER incidents_original_immutable BEFORE UPDATE ON operation_incidents
WHEN NEW.id IS NOT OLD.id OR NEW.worker_user_id IS NOT OLD.worker_user_id OR NEW.client_id IS NOT OLD.client_id OR NEW.dispatch_id IS NOT OLD.dispatch_id OR NEW.payload_json IS NOT OLD.payload_json OR NEW.payload_hash IS NOT OLD.payload_hash OR NEW.file_hash IS NOT OLD.file_hash OR NEW.receipt_r2_key IS NOT OLD.receipt_r2_key OR NEW.created_at IS NOT OLD.created_at OR OLD.status='RESOLVED'
BEGIN
 SELECT RAISE(ABORT,'INCIDENT_IMMUTABLE');
END;
CREATE TRIGGER incidents_delete_guard BEFORE DELETE ON operation_incidents
BEGIN
 SELECT RAISE(ABORT,'INCIDENT_HISTORY_IMMUTABLE');
END;
