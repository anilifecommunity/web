import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';
import { createSyncCursor, handleCloudSync, parseSyncOperation, readSyncCursor } from './cloudSync';
import type { Env } from './index';

const ACCOUNT = 'account-1';
const SESSION = { userId: ACCOUNT, sessionId: 'session-1' };
const KEY = 's'.repeat(48);
const PROFILE = '00000000-0000-4000-8000-000000000003';
const DEVICE = '00000000-0000-4000-8000-000000000002';

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values as SQLInputValue[];
    return this as unknown as D1PreparedStatement;
  }
  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>(): Promise<D1Result<T>> {
    return { results: this.statement.all(...this.values) as T[], success: true, meta: {} } as D1Result<T>;
  }
  async run<T>(): Promise<D1Result<T>> {
    this.statement.run(...this.values);
    return { results: [], success: true, meta: {} } as unknown as D1Result<T>;
  }
}

class Database {
  readonly sqlite = new DatabaseSync(':memory:');
  prepare(query: string): D1PreparedStatement {
    return new Statement(this.sqlite.prepare(query)) as unknown as D1PreparedStatement;
  }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function database(): Promise<Database> {
  const db = new Database();
  for (const name of ['0001_auth.sql', '0002_sync_core.sql', '0003_provider_identity_unique.sql', '0004_atomic_sync.sql']) {
    db.sqlite.exec(await readFile(new URL(`../migrations/cloud-sync/${name}`, import.meta.url), 'utf8'));
  }
  db.sqlite.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 1, ?, ?)`).run(ACCOUNT, 'test@example.com', Date.now(), Date.now());
  return db;
}

function env(db: Database): Env {
  return {
    ANILIFE_CLOUD_DB: db as unknown as D1Database,
    SYNC_CURSOR_KEY: KEY,
    AUTH_BASE_URL: 'https://anilife.cc',
    ASSETS: { fetch: async () => new Response('asset') },
  } as unknown as Env;
}

function operation(index = 1, baseRevision = 0, status = 'Watching') {
  return {
    opId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    profileId: PROFILE,
    entityType: 'watchlist',
    entityKey: `ANIME:al-${20 + index}`,
    action: 'upsert',
    baseRevision,
    value: {
      media: { kind: 'ANIME', mediaKey: `al-${20 + index}`, aliases: { anilist: 20 + index } },
      status,
      progress: index,
    },
  };
}

async function bootstrap(db: Database, account = ACCOUNT, sessionId = SESSION.sessionId) {
  const response = await handleCloudSync(new Request('https://anilife.cc/api/v1/bootstrap'), env(db), 'request-bootstrap', { userId: account, sessionId });
  const body = await response.json() as { deviceId: string; cursor: string };
  const csrf = /__Host-anilife-csrf=([^;,]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  assert.ok(csrf);
  return { response, body, csrf };
}

async function sync(db: Database, ops: unknown[], csrf: string, cursor: string | null = null, deviceId = DEVICE) {
  return handleCloudSync(new Request('https://anilife.cc/api/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://anilife.cc', 'X-Anilife-CSRF': csrf, Cookie: `__Host-anilife-csrf=${csrf}` },
    body: JSON.stringify({ protocolVersion: 1, deviceId, cursor, ops }),
  }), env(db), 'request-sync-0001', SESSION);
}

test('sync cursors are account-bound and reject tampering', async () => {
  const cursor = await createSyncCursor(KEY, ACCOUNT, 42);
  assert.equal(await readSyncCursor(KEY, ACCOUNT, cursor), 42);
  assert.equal(await readSyncCursor(KEY, 'another-account', cursor), null);
  assert.equal(await readSyncCursor(KEY, ACCOUNT, `${cursor.slice(0, -1)}x`), null);
});

test('operation validation rejects unknown fields, mismatched media and oversized data', () => {
  assert.ok(parseSyncOperation(operation()));
  assert.equal(parseSyncOperation({ ...operation(), secret: 'no' }), null);
  const invalidDelete = { ...operation(), action: 'delete', entityKey: 'anything' };
  delete (invalidDelete as { value?: unknown }).value;
  assert.equal(parseSyncOperation(invalidDelete), null);
  const mismatched = operation();
  mismatched.value.media.aliases.anilist = 999;
  assert.equal(parseSyncOperation(mismatched), null);
  assert.equal(parseSyncOperation({ ...operation(), value: { ...operation().value, padding: 'x'.repeat(11_000) } }), null);
});

test('bootstrap is read-only, bounded and issues session-bound browser values', async () => {
  const db = await database();
  const result = await bootstrap(db);
  assert.equal(result.response.status, 200);
  assert.match(result.body.deviceId, /^[0-9a-f-]{36}$/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get()?.count, 0);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
});

test('a sync batch commits atomically and exact retries are idempotent', async () => {
  const db = await database();
  const { csrf } = await bootstrap(db);
  const ops = Array.from({ length: 10 }, (_, index) => operation(index + 1));
  const first = await sync(db, ops, csrf);
  assert.equal(first.status, 200);
  const body = await first.json() as { acknowledged: string[]; changes: unknown[] };
  assert.equal(body.acknowledged.length, 10);
  assert.equal(body.changes.length, 10);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_items').get()?.count, 10);
  assert.equal((await sync(db, ops, csrf)).status, 200);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_changes').get()?.count, 10);
});

test('one stale operation rejects the whole batch without dropping another edit', async () => {
  const db = await database();
  const { csrf } = await bootstrap(db);
  assert.equal((await sync(db, [operation(1)], csrf)).status, 200);
  const stale = { ...operation(2), opId: '00000000-0000-4000-8000-000000000050', entityKey: 'ANIME:al-21', value: operation(1).value };
  const response = await sync(db, [stale, operation(3)], csrf);
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { conflicts: unknown[] }).conflicts.length, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM sync_items WHERE entity_key = 'ANIME:al-23'").get()?.count, 0);
});

test('tombstones block stale resurrection and empty sync performs zero writes', async () => {
  const db = await database();
  const { csrf } = await bootstrap(db);
  assert.equal((await sync(db, [], csrf)).status, 200);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get()?.count, 0);
  assert.equal((await sync(db, [operation(1)], csrf)).status, 200);
  const deletion = { ...operation(1, 1), opId: '00000000-0000-4000-8000-000000000099', action: 'delete' };
  delete (deletion as { value?: unknown }).value;
  assert.equal((await sync(db, [deletion], csrf)).status, 200);
  assert.equal((await sync(db, [{ ...operation(1), opId: '00000000-0000-4000-8000-000000000100' }], csrf)).status, 409);
  const row = db.sqlite.prepare("SELECT revision, payload_json, deleted_at FROM sync_items WHERE entity_key = 'ANIME:al-21'").get();
  assert.deepEqual({ revision: row?.revision, payload: row?.payload_json }, { revision: 2, payload: null });
  assert.ok(row?.deleted_at);
});

test('mutations require exact origin and session-bound double-submit CSRF', async () => {
  const db = await database();
  const { csrf } = await bootstrap(db);
  const denied = await handleCloudSync(new Request('https://anilife.cc/api/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-Anilife-CSRF': csrf, Cookie: `__Host-anilife-csrf=${csrf}` },
    body: JSON.stringify({ protocolVersion: 1, deviceId: DEVICE, cursor: null, ops: [] }),
  }), env(db), 'request-csrf-1', SESSION);
  assert.equal(denied.status, 403);
});

test('cursors cannot cross accounts and revoked devices cannot write again', async () => {
  const db = await database();
  db.sqlite.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('account-2', 'Other', 'other@example.com', 1, 0, 0)`).run();
  const { body, csrf } = await bootstrap(db);
  assert.equal((await sync(db, [operation(1)], csrf)).status, 200);
  const cross = await handleCloudSync(new Request(`https://anilife.cc/api/v1/export?cursor=${body.cursor}`), env(db), 'request-cross-1', { userId: 'account-2', sessionId: 'session-2' });
  assert.equal(cross.status, 400);
  const revoke = await handleCloudSync(new Request('https://anilife.cc/api/v1/devices/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://anilife.cc', 'X-Anilife-CSRF': csrf, Cookie: `__Host-anilife-csrf=${csrf}` },
    body: JSON.stringify({ protocolVersion: 1, deviceId: DEVICE }),
  }), env(db), 'request-revoke-1', SESSION);
  assert.equal(revoke.status, 204);
  assert.equal((await sync(db, [operation(2)], csrf)).status, 403);
});

test('account deletion is scoped to the authenticated user and cascades sync data', async () => {
  const db = await database();
  const { csrf } = await bootstrap(db);
  assert.equal((await sync(db, [operation(1)], csrf)).status, 200);
  const response = await handleCloudSync(new Request('https://anilife.cc/api/v1/account', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Origin: 'https://anilife.cc', 'X-Anilife-CSRF': csrf, Cookie: `__Host-anilife-csrf=${csrf}` },
    body: JSON.stringify({ protocolVersion: 1, confirmation: 'DELETE' }),
  }), env(db), 'request-delete-1', SESSION);
  assert.equal(response.status, 204);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM "user"').get()?.count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_items').get()?.count, 0);
});
