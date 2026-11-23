import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migration = (name: string) =>
  readFile(new URL(`../migrations/cloud-sync/${name}`, import.meta.url), 'utf8');

test('cloud sync migrations build an isolated, referentially sound schema', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(await migration('0001_auth.sql'));
  db.exec(await migration('0002_sync_core.sql'));
  db.exec(await migration('0003_provider_identity_unique.sql'));

  const tables = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((row) => String(row.name));
  assert.deepEqual(tables, [
    'account',
    'session',
    'sync_accounts',
    'sync_changes',
    'sync_devices',
    'sync_items',
    'sync_operation_receipts',
    'sync_profiles',
    'user',
    'verification',
  ]);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  const providerIndex = db.prepare(
    "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = 'account_provider_subject_idx'",
  ).get() as { sql: string };
  assert.match(providerIndex.sql, /CREATE UNIQUE INDEX/);
});
