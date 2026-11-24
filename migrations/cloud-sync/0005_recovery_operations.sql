ALTER TABLE sync_accounts ADD COLUMN recovery_snapshot_at INTEGER;
ALTER TABLE sync_accounts ADD COLUMN recovery_attempt_at INTEGER;
ALTER TABLE sync_accounts ADD COLUMN recovery_snapshot_sequence INTEGER;
ALTER TABLE sync_accounts ADD COLUMN recovery_bytes INTEGER NOT NULL DEFAULT 0 CHECK (recovery_bytes >= 0);

CREATE TABLE cloud_sync_metrics (
  day TEXT PRIMARY KEY,
  sync_requests INTEGER NOT NULL DEFAULT 0 CHECK (sync_requests >= 0),
  sync_operations INTEGER NOT NULL DEFAULT 0 CHECK (sync_operations >= 0),
  sync_errors INTEGER NOT NULL DEFAULT 0 CHECK (sync_errors >= 0),
  sync_conflicts INTEGER NOT NULL DEFAULT 0 CHECK (sync_conflicts >= 0),
  recovery_class_a INTEGER NOT NULL DEFAULT 0 CHECK (recovery_class_a >= 0),
  recovery_writes INTEGER NOT NULL DEFAULT 0 CHECK (recovery_writes >= 0),
  recovery_errors INTEGER NOT NULL DEFAULT 0 CHECK (recovery_errors >= 0),
  max_recovery_lag_ms INTEGER NOT NULL DEFAULT 0 CHECK (max_recovery_lag_ms >= 0)
) WITHOUT ROWID;
