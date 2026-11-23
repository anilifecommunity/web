PRAGMA foreign_keys = ON;

CREATE TABLE sync_accounts (
  account_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  history_floor_sequence INTEGER NOT NULL DEFAULT 0 CHECK (history_floor_sequence >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE sync_profiles (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, profile_id)
) WITHOUT ROWID;

CREATE TABLE sync_devices (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'android_tv')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (account_id, device_id)
) WITHOUT ROWID;

CREATE TABLE sync_items (
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'profile', 'portable_setting', 'watchlist', 'watched_episode',
    'continue_progress', 'linked_identity_metadata'
  )),
  entity_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload_json TEXT,
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, profile_id, entity_type, entity_key),
  FOREIGN KEY (account_id, profile_id)
    REFERENCES sync_profiles (account_id, profile_id) ON DELETE CASCADE,
  CHECK ((payload_json IS NULL) = (deleted_at IS NOT NULL))
) WITHOUT ROWID;

CREATE TABLE sync_operation_receipts (
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  committed_revision INTEGER NOT NULL CHECK (committed_revision > 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, operation_id),
  FOREIGN KEY (account_id, device_id)
    REFERENCES sync_devices (account_id, device_id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE sync_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES sync_accounts (account_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id, profile_id)
    REFERENCES sync_profiles (account_id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, operation_id)
    REFERENCES sync_operation_receipts (account_id, operation_id) ON DELETE CASCADE,
  CHECK ((action = 'delete' AND payload_json IS NULL) OR
         (action = 'upsert' AND payload_json IS NOT NULL))
);

CREATE INDEX sync_items_account_revision
  ON sync_items (account_id, revision, profile_id, entity_type, entity_key);
CREATE INDEX sync_changes_account_sequence
  ON sync_changes (account_id, sequence);
CREATE INDEX sync_receipts_account_created
  ON sync_operation_receipts (account_id, created_at);
CREATE INDEX sync_devices_account_active
  ON sync_devices (account_id, revoked_at, last_seen_at);
