ALTER TABLE sync_operation_receipts ADD COLUMN base_revision INTEGER NOT NULL DEFAULT 0 CHECK (base_revision >= 0);
ALTER TABLE sync_operation_receipts ADD COLUMN profile_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sync_operation_receipts ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'profile';
ALTER TABLE sync_operation_receipts ADD COLUMN entity_key TEXT NOT NULL DEFAULT '';
ALTER TABLE sync_operation_receipts ADD COLUMN action TEXT NOT NULL DEFAULT 'upsert' CHECK (action IN ('upsert', 'delete'));
ALTER TABLE sync_operation_receipts ADD COLUMN payload_json TEXT;
ALTER TABLE sync_operation_receipts ADD COLUMN operation_hash TEXT NOT NULL DEFAULT '';

CREATE TRIGGER sync_receipt_validate
BEFORE INSERT ON sync_operation_receipts
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_devices
    WHERE account_id = NEW.account_id AND device_id = NEW.device_id AND revoked_at IS NULL
  ) THEN RAISE(ABORT, 'device_not_active') END;

  SELECT CASE WHEN NEW.committed_revision <> NEW.base_revision + 1
    THEN RAISE(ABORT, 'invalid_committed_revision') END;

  SELECT CASE WHEN COALESCE((
    SELECT revision FROM sync_items
    WHERE account_id = NEW.account_id
      AND profile_id = NEW.profile_id
      AND entity_type = NEW.entity_type
      AND entity_key = NEW.entity_key
  ), 0) <> NEW.base_revision THEN RAISE(ABORT, 'revision_conflict') END;

  SELECT CASE WHEN
    (NEW.action = 'delete' AND NEW.payload_json IS NOT NULL) OR
    (NEW.action = 'upsert' AND NEW.payload_json IS NULL)
    THEN RAISE(ABORT, 'invalid_operation_payload') END;
END;

CREATE TRIGGER sync_receipt_apply
AFTER INSERT ON sync_operation_receipts
BEGIN
  INSERT INTO sync_items (
    account_id, profile_id, entity_type, entity_key, revision,
    payload_json, deleted_at, updated_at
  ) VALUES (
    NEW.account_id, NEW.profile_id, NEW.entity_type, NEW.entity_key,
    NEW.committed_revision, NEW.payload_json,
    CASE WHEN NEW.action = 'delete' THEN NEW.created_at ELSE NULL END,
    NEW.created_at
  )
  ON CONFLICT (account_id, profile_id, entity_type, entity_key) DO UPDATE SET
    revision = excluded.revision,
    payload_json = excluded.payload_json,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at;

  INSERT INTO sync_changes (
    account_id, profile_id, operation_id, entity_type, entity_key,
    revision, action, payload_json, created_at
  ) VALUES (
    NEW.account_id, NEW.profile_id, NEW.operation_id, NEW.entity_type,
    NEW.entity_key, NEW.committed_revision, NEW.action, NEW.payload_json,
    NEW.created_at
  );

  UPDATE sync_accounts
  SET revision = revision + 1, updated_at = NEW.created_at
  WHERE account_id = NEW.account_id;
END;
