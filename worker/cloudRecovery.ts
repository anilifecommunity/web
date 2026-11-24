import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Env } from './index';

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const RETRY_MS = 24 * 60 * 60 * 1_000;
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const MAX_SNAPSHOT_ITEMS = 5_000;
const MAX_RECOVERY_CLASS_A_PER_31_DAYS = 10_000;
const MAX_RECOVERY_STORED_BYTES = 7_000_000_000;

type Metric = 'sync_requests' | 'sync_operations' | 'sync_errors' | 'sync_conflicts' | 'recovery_writes' | 'recovery_errors';
type RecoveryResult = 'written' | 'not_due' | 'unavailable' | 'limited' | 'too_large' | 'failed';

interface AccountRow {
  revision: number;
  recovery_snapshot_at: number | null;
  recovery_attempt_at: number | null;
  recovery_bytes: number;
}

interface ItemRow {
  profile_id: string;
  entity_type: string;
  entity_key: string;
  revision: number;
  payload_json: string | null;
  deleted_at: number | null;
}

function day(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function recordCloudMetric(db: D1Database, metric: Metric, amount = 1, now = Date.now()): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount < 0) return;
  try {
    await db.prepare(
      `INSERT INTO cloud_sync_metrics (day, ${metric}) VALUES (?1, ?2)
       ON CONFLICT(day) DO UPDATE SET ${metric} = ${metric} + excluded.${metric}`,
    ).bind(day(now), amount).run();
  } catch {}
}

async function hmac(key: string, value: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function recoveryObjectKey(secret: string, accountId: string): Promise<string> {
  return `recovery/v1/${await hmac(secret, `account:${accountId}`)}.json`;
}

function configured(env: Env): env is Env & { CLOUD_RECOVERY_BUCKET: R2Bucket; CLOUD_RECOVERY_KEY: string } {
  return Boolean(env.CLOUD_RECOVERY_BUCKET && env.CLOUD_RECOVERY_KEY && env.CLOUD_RECOVERY_KEY.length >= 32);
}

async function reserveClassA(db: D1Database, now: number): Promise<boolean> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const row = await db.prepare(
    `INSERT INTO cloud_sync_metrics (day, recovery_class_a)
     SELECT ?1, 1 WHERE (
       SELECT COALESCE(SUM(recovery_class_a), 0) FROM cloud_sync_metrics WHERE day >= ?2
     ) < ?3
     ON CONFLICT(day) DO UPDATE SET recovery_class_a = recovery_class_a + 1
     WHERE (
       SELECT COALESCE(SUM(recovery_class_a), 0) FROM cloud_sync_metrics WHERE day >= ?2
     ) < ?3
     RETURNING recovery_class_a AS count`,
  ).bind(day(now), cutoff.toISOString().slice(0, 10), MAX_RECOVERY_CLASS_A_PER_31_DAYS).first<{ count: number }>();
  return Boolean(row);
}

async function sha256(value: Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function writeRecoverySnapshot(env: Env, accountId: string, now = Date.now()): Promise<RecoveryResult> {
  const db = env.ANILIFE_CLOUD_DB;
  if (!db || !configured(env)) return 'unavailable';
  const account = await db.prepare(
    `SELECT revision, recovery_snapshot_at, recovery_attempt_at, recovery_bytes
     FROM sync_accounts WHERE account_id = ?1`,
  ).bind(accountId).first<AccountRow>();
  if (!account) return 'not_due';
  const lastSnapshot = Number(account.recovery_snapshot_at ?? 0);
  const lastAttempt = Number(account.recovery_attempt_at ?? 0);
  if (lastSnapshot + WEEK_MS > now || lastAttempt + RETRY_MS > now) return 'not_due';
  const lag = lastSnapshot ? Math.max(0, now - lastSnapshot) : 0;
  await db.prepare('UPDATE sync_accounts SET recovery_attempt_at = ?1 WHERE account_id = ?2')
    .bind(now, accountId).run();

  const items = (await db.prepare(
    `SELECT profile_id, entity_type, entity_key, revision, payload_json, deleted_at
     FROM sync_items WHERE account_id = ?1
     ORDER BY profile_id, entity_type, entity_key LIMIT ?2`,
  ).bind(accountId, MAX_SNAPSHOT_ITEMS + 1).all<ItemRow>()).results;
  if (items.length > MAX_SNAPSHOT_ITEMS) {
    await recordCloudMetric(db, 'recovery_errors', 1, now);
    return 'too_large';
  }
  const payload = {
    schema: 1,
    createdAt: new Date(now).toISOString(),
    revision: Number(account.revision),
    items: items.map((item) => ({
      profileId: item.profile_id,
      entityType: item.entity_type,
      entityKey: item.entity_key,
      revision: Number(item.revision),
      action: item.deleted_at === null ? 'upsert' : 'delete',
      ...(item.deleted_at === null && item.payload_json ? { value: JSON.parse(item.payload_json) } : {}),
    })),
  };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  if (body.byteLength > MAX_SNAPSHOT_BYTES) {
    await recordCloudMetric(db, 'recovery_errors', 1, now);
    return 'too_large';
  }
  if (!(await reserveClassA(db, now))) {
    await recordCloudMetric(db, 'recovery_errors', 1, now);
    return 'limited';
  }
  const reserved = await db.prepare(
    `UPDATE sync_accounts SET recovery_bytes = ?1
     WHERE account_id = ?2 AND (
       SELECT COALESCE(SUM(recovery_bytes), 0) FROM sync_accounts
     ) - recovery_bytes + ?1 <= ?3
     RETURNING recovery_bytes AS bytes`,
  ).bind(body.byteLength, accountId, MAX_RECOVERY_STORED_BYTES).first<{ bytes: number }>();
  if (!reserved) {
    await recordCloudMetric(db, 'recovery_errors', 1, now);
    return 'limited';
  }
  try {
    await env.CLOUD_RECOVERY_BUCKET.put(await recoveryObjectKey(env.CLOUD_RECOVERY_KEY, accountId), body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { schema: '1', revision: String(account.revision), sha256: await sha256(body) },
    });
    await db.prepare(
      `UPDATE sync_accounts SET recovery_snapshot_at = ?1, recovery_snapshot_sequence = revision
       WHERE account_id = ?2`,
    ).bind(now, accountId).run();
    await recordCloudMetric(db, 'recovery_writes', 1, now);
    await db.prepare(
      `INSERT INTO cloud_sync_metrics (day, max_recovery_lag_ms) VALUES (?1, ?2)
       ON CONFLICT(day) DO UPDATE SET max_recovery_lag_ms = MAX(max_recovery_lag_ms, excluded.max_recovery_lag_ms)`,
    ).bind(day(now), lag).run();
    return 'written';
  } catch {
    await db.prepare(
      'UPDATE sync_accounts SET recovery_bytes = ?1 WHERE account_id = ?2 AND recovery_bytes = ?3',
    ).bind(account.recovery_bytes, accountId, body.byteLength).run();
    await recordCloudMetric(db, 'recovery_errors', 1, now);
    return 'failed';
  }
}

export async function deleteRecoverySnapshot(env: Env, accountId: string): Promise<boolean> {
  if (!configured(env)) return false;
  try {
    await env.CLOUD_RECOVERY_BUCKET.delete(await recoveryObjectKey(env.CLOUD_RECOVERY_KEY, accountId));
    return true;
  } catch {
    return false;
  }
}
