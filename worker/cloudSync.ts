import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { authBaseUrl, authConfigured, getCloudSession, sessionCookieName, type CloudSession } from './auth';
import { readCookie } from './gate';
import { RequestBodyError, readRequestJsonCapped } from './guards';
import { json, parseInteger } from './http';
import { hit } from './rateLimit';
import type { Env } from './index';
import { deleteRecoverySnapshot, recordCloudMetric, writeRecoverySnapshot } from './cloudRecovery';

const PROTOCOL_VERSION = 1;
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_OPERATION_BYTES = 10 * 1024;
const MAX_OPERATIONS = 50;
const MAX_CHANGES = 250;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_PAGE_SIZE = 100;
const CSRF_COOKIE = '__Host-anilife-csrf';
const DEVICE_COOKIE = '__Host-anilife-device';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{16,512}$/;
const EPISODE = /^[1-9][0-9]{0,5}(?:\.[0-9]{1,3})?$/;
const ENTITY_TYPES = new Set([
  'profile', 'portable_setting', 'watchlist', 'watched_episode',
  'continue_progress', 'linked_identity_metadata',
]);

type JsonObject = Record<string, unknown>;
type Action = 'upsert' | 'delete';

export interface SyncOperation {
  opId: string;
  profileId: string;
  entityType: string;
  entityKey: string;
  action: Action;
  baseRevision: number;
  value?: JsonObject;
}

interface ChangeRow {
  sequence: number;
  profile_id: string;
  entity_type: string;
  entity_key: string;
  revision: number;
  action: Action;
  payload_json: string | null;
}

interface ItemRow {
  profile_id: string;
  entity_type: string;
  entity_key: string;
  revision: number;
  payload_json: string | null;
  deleted_at: number | null;
}

interface ReceiptRow {
  operation_id: string;
  operation_hash: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: unknown, required: string[], optional: string[] = []): value is JsonObject {
  if (!isObject(value) || required.some((key) => !(key in value))) return false;
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key));
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function finite(value: unknown, min: number, max: number, exclusiveMin = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    (exclusiveMin ? value > min : value >= min) && value <= max;
}

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function validMedia(value: unknown, kind?: 'ANIME' | 'MANGA'): value is JsonObject {
  if (!exact(value, ['kind', 'mediaKey', 'aliases'])) return false;
  if (!['ANIME', 'MANGA'].includes(String(value.kind)) || (kind && value.kind !== kind)) return false;
  if (typeof value.mediaKey !== 'string' || !/^al-[1-9][0-9]{0,9}$/.test(value.mediaKey)) return false;
  if (!exact(value.aliases, ['anilist'], ['mal'])) return false;
  const aliases = value.aliases;
  if (!integer(aliases.anilist, 1, 9_999_999_999)) return false;
  if ('mal' in aliases && !integer(aliases.mal, 1, 9_999_999_999)) return false;
  return Number(value.mediaKey.slice(3)) === aliases.anilist;
}

function validProfile(value: unknown): value is JsonObject {
  return exact(value, ['name'], ['avatarRef', 'accentColor', 'kidsMode']) &&
    text(value.name, 1, 64) &&
    (!('avatarRef' in value) || text(value.avatarRef, 1, 256)) &&
    (!('accentColor' in value) || (typeof value.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.accentColor))) &&
    (!('kidsMode' in value) || typeof value.kidsMode === 'boolean');
}

const BOOLEAN_SETTINGS = new Set([
  'autoPlayNext', 'autoSkipIntro', 'skipFiller', 'showSkipButton', 'subtitlesOnDub',
  'showSubtitlesByDefault', 'hideAdultContent', 'displayRelatedManga', 'blurSpoilers',
]);

function validSetting(value: unknown): value is JsonObject {
  if (!exact(value, ['key', 'value']) || typeof value.key !== 'string') return false;
  if (BOOLEAN_SETTINGS.has(value.key)) return typeof value.value === 'boolean';
  if (value.key === 'titleLanguage') return ['english', 'romaji', 'native'].includes(String(value.value));
  if (value.key === 'defaultAudioMode') return ['SUB', 'DUB'].includes(String(value.value));
  if (['preferredSubLanguage', 'secondChoiceSubtitles'].includes(value.key)) return text(value.value, 2, 32);
  if (value.key === 'defaultQuality') return ['auto', '360p', '480p', '720p', '1080p'].includes(String(value.value));
  if (value.key === 'themePreset') return text(value.value, 1, 32);
  if (value.key === 'accentColor') return typeof value.value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.value);
  if (value.key === 'watchedThreshold') return finite(value.value, 50, 100);
  if (value.key === 'skipButtonLength') return finite(value.value, 5, 180);
  return value.key === 'playbackSpeed' && finite(value.value, 0.25, 4);
}

function validWatchlist(value: unknown): value is JsonObject {
  return exact(value, ['media', 'status'], ['progress', 'score']) && validMedia(value.media) &&
    ['Planning', 'Watching', 'Rewatching', 'Paused', 'Completed', 'Dropped'].includes(String(value.status)) &&
    (!('progress' in value) || integer(value.progress, 0, 100_000)) &&
    (!('score' in value) || finite(value.score, 0, 100));
}

function validWatched(value: unknown): value is JsonObject {
  return exact(value, ['media', 'episode', 'watched']) && validMedia(value.media, 'ANIME') &&
    typeof value.episode === 'string' && EPISODE.test(value.episode) && typeof value.watched === 'boolean';
}

function validProgress(value: unknown): value is JsonObject {
  return exact(value, ['media', 'episode', 'positionSeconds', 'durationSeconds', 'audioMode']) &&
    validMedia(value.media, 'ANIME') && typeof value.episode === 'string' && EPISODE.test(value.episode) &&
    finite(value.positionSeconds, 0, 86_400) && finite(value.durationSeconds, 0, 86_400, true) &&
    value.positionSeconds <= value.durationSeconds && ['SUB', 'DUB'].includes(String(value.audioMode));
}

function validIdentity(value: unknown): value is JsonObject {
  return exact(value, ['provider', 'externalSubject'], ['displayName']) &&
    ['anilist', 'mal'].includes(String(value.provider)) && text(value.externalSubject, 1, 128) &&
    (!('displayName' in value) || text(value.displayName, 1, 80));
}

function validEntityKey(operation: SyncOperation): boolean {
  if (operation.entityType === 'profile') return operation.entityKey === 'profile';
  if (operation.entityType === 'portable_setting') return /^setting:[A-Za-z][A-Za-z0-9]{1,63}$/.test(operation.entityKey);
  if (operation.entityType === 'watchlist') return /^(ANIME|MANGA):al-[1-9][0-9]{0,9}$/.test(operation.entityKey);
  if (operation.entityType === 'watched_episode') return /^ANIME:al-[1-9][0-9]{0,9}:episode:[1-9][0-9]{0,5}(?:\.[0-9]{1,3})?$/.test(operation.entityKey);
  if (operation.entityType === 'continue_progress') return /^ANIME:al-[1-9][0-9]{0,9}$/.test(operation.entityKey);
  return /^identity:(anilist|mal)$/.test(operation.entityKey);
}

function validOperationValue(operation: SyncOperation): boolean {
  if (!validEntityKey(operation)) return false;
  if (operation.action === 'delete') return operation.value === undefined;
  const value = operation.value;
  if (!value) return false;
  if (operation.entityType === 'profile') return operation.entityKey === 'profile' && validProfile(value);
  if (operation.entityType === 'portable_setting') {
    return validSetting(value) && operation.entityKey === `setting:${String(value.key)}`;
  }
  if (operation.entityType === 'watchlist') {
    return validWatchlist(value) && operation.entityKey === `${String((value.media as JsonObject).kind)}:${String((value.media as JsonObject).mediaKey)}`;
  }
  if (operation.entityType === 'watched_episode') {
    return validWatched(value) && operation.entityKey === `ANIME:${String((value.media as JsonObject).mediaKey)}:episode:${String(value.episode)}`;
  }
  if (operation.entityType === 'continue_progress') {
    return validProgress(value) && operation.entityKey === `ANIME:${String((value.media as JsonObject).mediaKey)}`;
  }
  return operation.entityType === 'linked_identity_metadata' && validIdentity(value) &&
    operation.entityKey === `identity:${String(value.provider)}`;
}

export function parseSyncOperation(value: unknown): SyncOperation | null {
  if (!exact(value, ['opId', 'profileId', 'entityType', 'entityKey', 'action', 'baseRevision'], ['value'])) return null;
  const operation = value as unknown as SyncOperation;
  if (!UUID_V4.test(operation.opId) || !UUID_V4.test(operation.profileId) ||
    !ENTITY_TYPES.has(operation.entityType) || !text(operation.entityKey, 1, 160) ||
    !['upsert', 'delete'].includes(operation.action) || !integer(operation.baseRevision, 0)) return null;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_OPERATION_BYTES) return null;
  return validOperationValue(operation) ? operation : null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64url(new Uint8Array(bytes));
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(key: string, value: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value))));
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function createSyncCursor(key: string, accountId: string, sequence: number): Promise<string> {
  const encoded = sequence.toString(36);
  return `v1_${encoded}_${await hmac(key, `v1:${accountId}:${encoded}`)}`;
}

export async function readSyncCursor(key: string, accountId: string, cursor: string | null): Promise<number | null> {
  if (cursor === null) return 0;
  if (!CURSOR.test(cursor)) return null;
  const parts = cursor.split('_');
  if (parts.length !== 3 || parts[0] !== 'v1' || !/^[0-9a-z]+$/.test(parts[1])) return null;
  const sequence = Number.parseInt(parts[1], 36);
  if (!Number.isSafeInteger(sequence) || sequence < 0) return null;
  const expected = await hmac(key, `v1:${accountId}:${parts[1]}`);
  return equal(parts[2], expected) ? sequence : null;
}

function error(status: number, code: string, requestId: string, extra: JsonObject = {}): Response {
  return json({ error: code, requestId, ...extra }, status);
}

function protocolError(requestId: string): Response {
  return error(426, 'protocol_unsupported', requestId);
}

function rateLimited(requestId: string, retryAfterSeconds: number): Response {
  return json({ error: 'rate_limited', requestId, retryAfterSeconds }, 429, {
    'Retry-After': String(retryAfterSeconds),
  });
}

function pageLimit(url: URL): number | null {
  const raw = url.searchParams.get('limit');
  const parsed = parseInteger(raw, DEFAULT_PAGE_SIZE);
  return parsed && parsed <= MAX_CHANGES ? parsed : null;
}

function change(row: ChangeRow | ItemRow): JsonObject {
  const action = 'action' in row ? row.action : row.deleted_at === null ? 'upsert' : 'delete';
  return {
    profileId: row.profile_id,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    action,
    revision: Number(row.revision),
    ...(action === 'upsert' && row.payload_json ? { value: JSON.parse(row.payload_json) } : {}),
  };
}

async function accountWindow(db: D1Database, accountId: string): Promise<{ floor: number; current: number }> {
  const row = await db.prepare(
    `SELECT history_floor_sequence AS floor,
      COALESCE((SELECT MAX(sequence) FROM sync_changes WHERE account_id = ?1), 0) AS current
     FROM sync_accounts WHERE account_id = ?1`,
  ).bind(accountId).first<{ floor: number; current: number }>();
  return row ? { floor: Number(row.floor), current: Number(row.current) } : { floor: 0, current: 0 };
}

async function readPage(
  db: D1Database,
  key: string,
  accountId: string,
  sequence: number,
  limit: number,
  base: JsonObject,
): Promise<JsonObject> {
  const rows = (await db.prepare(
    `SELECT sequence, profile_id, entity_type, entity_key, revision, action, payload_json
     FROM sync_changes WHERE account_id = ?1 AND sequence > ?2 ORDER BY sequence LIMIT ?3`,
  ).bind(accountId, sequence, limit + 1).all<ChangeRow>()).results;
  const selected: JsonObject[] = [];
  let last = sequence;
  for (const row of rows.slice(0, limit)) {
    const next = [...selected, change(row)];
    const candidate = { ...base, changes: next, cursor: await createSyncCursor(key, accountId, Number(row.sequence)) };
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_RESPONSE_BYTES) break;
    selected.push(next.at(-1) as JsonObject);
    last = Number(row.sequence);
  }
  return {
    ...base,
    cursor: await createSyncCursor(key, accountId, last),
    changes: selected,
    hasMore: rows.length > selected.length,
  };
}

async function cursorSequence(
  db: D1Database,
  key: string,
  accountId: string,
  raw: string | null,
  requestId: string,
): Promise<number | Response> {
  const sequence = await readSyncCursor(key, accountId, raw);
  if (sequence === null) return error(400, 'invalid_request', requestId);
  const window = await accountWindow(db, accountId);
  if (sequence < window.floor) {
    return json({
      protocolVersion: 1,
      error: 'cursor_expired',
      requestId,
      bootstrapPath: '/api/v1/bootstrap',
      serverTime: new Date().toISOString(),
    }, 410);
  }
  if (sequence > window.current) return error(400, 'invalid_request', requestId);
  return sequence;
}

function cookie(name: string, value: string, httpOnly = false): string {
  return `${name}=${value}; Path=/; Secure; SameSite=Strict; Max-Age=2592000${httpOnly ? '; HttpOnly' : ''}`;
}

async function csrf(key: string, sessionId: string): Promise<string> {
  return hmac(key, `csrf:${sessionId}`);
}

function withBootstrapCookies(response: Response, csrfValue: string, deviceId: string): Response {
  response.headers.append('Set-Cookie', cookie(CSRF_COOKIE, csrfValue));
  response.headers.append('Set-Cookie', cookie(DEVICE_COOKIE, deviceId, true));
  return response;
}

async function mutationAllowed(request: Request, env: Env, session: CloudSession, key: string): Promise<boolean> {
  const base = authBaseUrl(env);
  if (!base || request.headers.get('Origin') !== base) return false;
  const supplied = request.headers.get('X-Anilife-CSRF') ?? '';
  const stored = readCookie(request, CSRF_COOKIE) ?? '';
  const expected = await csrf(key, session.sessionId);
  return supplied.length > 0 && equal(supplied, stored) && equal(supplied, expected);
}

async function readBody(request: Request, requestId: string): Promise<JsonObject | Response> {
  try {
    const body = await readRequestJsonCapped<unknown>(request, MAX_REQUEST_BYTES);
    return isObject(body) ? body : error(400, 'invalid_request', requestId);
  } catch (caught) {
    if (caught instanceof RequestBodyError && caught.reason === 'request_too_large') {
      return error(413, 'payload_too_large', requestId);
    }
    return error(400, 'invalid_request', requestId);
  }
}

function receiptStatements(
  db: D1Database,
  accountId: string,
  deviceId: string,
  operations: Array<SyncOperation & { hash: string }>,
  now: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO sync_accounts (account_id, created_at, updated_at) VALUES (?1, ?2, ?2)
      ON CONFLICT (account_id) DO NOTHING`).bind(accountId, now),
    db.prepare(`INSERT INTO sync_devices (account_id, device_id, label, platform, created_at, last_seen_at)
      VALUES (?1, ?2, 'Web browser', 'web', ?3, ?3)
      ON CONFLICT (account_id, device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`).bind(accountId, deviceId, now),
  ];
  for (const profileId of new Set(operations.map((operation) => operation.profileId))) {
    statements.push(db.prepare(`INSERT INTO sync_profiles (account_id, profile_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?3)
      ON CONFLICT (account_id, profile_id) DO UPDATE SET updated_at = excluded.updated_at`).bind(accountId, profileId, now));
  }
  for (const operation of operations) {
    statements.push(db.prepare(`INSERT INTO sync_operation_receipts (
      account_id, operation_id, device_id, committed_revision, created_at,
      base_revision, profile_id, entity_type, entity_key, action, payload_json, operation_hash
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`).bind(
      accountId, operation.opId, deviceId, operation.baseRevision + 1, now,
      operation.baseRevision, operation.profileId, operation.entityType, operation.entityKey,
      operation.action, operation.value ? stable(operation.value) : null, operation.hash,
    ));
  }
  return statements;
}

async function receipts(db: D1Database, accountId: string, operations: SyncOperation[]): Promise<Map<string, ReceiptRow>> {
  const found = await Promise.all(operations.map((operation) => db.prepare(
    `SELECT operation_id, operation_hash FROM sync_operation_receipts
     WHERE account_id = ?1 AND operation_id = ?2`,
  ).bind(accountId, operation.opId).first<ReceiptRow>()));
  return new Map(found.filter(Boolean).map((row) => [String(row?.operation_id), row as ReceiptRow]));
}

function itemKey(operation: SyncOperation): string {
  return `${operation.profileId}\0${operation.entityType}\0${operation.entityKey}`;
}

async function items(db: D1Database, accountId: string, operations: SyncOperation[]): Promise<Map<string, ItemRow>> {
  const unique = [...new Map(operations.map((operation) => [itemKey(operation), operation])).values()];
  const found = await Promise.all(unique.map((operation) => db.prepare(
    `SELECT profile_id, entity_type, entity_key, revision, payload_json, deleted_at
     FROM sync_items WHERE account_id = ?1 AND profile_id = ?2 AND entity_type = ?3 AND entity_key = ?4`,
  ).bind(accountId, operation.profileId, operation.entityType, operation.entityKey).first<ItemRow>()));
  return new Map(found.filter(Boolean).map((row) => [
    `${row?.profile_id}\0${row?.entity_type}\0${row?.entity_key}`,
    row as ItemRow,
  ]));
}

function conflictResponse(requestId: string, conflicts: JsonObject[]): Response {
  return json({
    protocolVersion: 1,
    error: 'revision_conflict',
    requestId,
    conflicts,
    serverTime: new Date().toISOString(),
  }, 409);
}

async function conflicts(
  db: D1Database,
  accountId: string,
  operations: SyncOperation[],
  acknowledged: Set<string>,
): Promise<JsonObject[]> {
  const current = await items(db, accountId, operations);
  const virtual = new Map([...current].map(([key, row]) => [key, Number(row.revision)]));
  const result: JsonObject[] = [];
  for (const operation of operations) {
    if (acknowledged.has(operation.opId)) continue;
    const key = itemKey(operation);
    const revision = virtual.get(key) ?? 0;
    if (revision !== operation.baseRevision) {
      const row = current.get(key);
      result.push({
        opId: operation.opId,
        currentRevision: Math.max(1, revision),
        ...(row ? { current: change(row) } : {}),
      });
    } else {
      virtual.set(key, revision + 1);
    }
  }
  return result;
}

async function handleBootstrap(
  request: Request,
  env: Env,
  requestId: string,
  session: CloudSession,
  db: D1Database,
  key: string,
): Promise<Response> {
  const url = new URL(request.url);
  const limit = pageLimit(url);
  if (!limit) return error(400, 'invalid_request', requestId);
  const sequence = await cursorSequence(db, key, session.userId, url.searchParams.get('cursor'), requestId);
  if (sequence instanceof Response) return sequence;
  const currentDevice = readCookie(request, DEVICE_COOKIE);
  const deviceId = currentDevice && UUID_V4.test(currentDevice) ? currentDevice : crypto.randomUUID();
  const result = await readPage(db, key, session.userId, sequence, limit, {
    protocolVersion: 1,
    deviceId,
    changes: [],
    hasMore: false,
    serverTime: new Date().toISOString(),
    capabilities: {
      maxRequestBytes: MAX_REQUEST_BYTES,
      maxOps: MAX_OPERATIONS,
      maxChanges: MAX_CHANGES,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    },
  });
  return withBootstrapCookies(json(result), await csrf(key, session.sessionId), deviceId);
}

async function handleExport(
  request: Request,
  requestId: string,
  session: CloudSession,
  db: D1Database,
  key: string,
): Promise<Response> {
  const url = new URL(request.url);
  const limit = pageLimit(url);
  if (!limit) return error(400, 'invalid_request', requestId);
  const sequence = await cursorSequence(db, key, session.userId, url.searchParams.get('cursor'), requestId);
  if (sequence instanceof Response) return sequence;
  return json(await readPage(db, key, session.userId, sequence, limit, {
    protocolVersion: 1,
    exportedAt: new Date().toISOString(),
    changes: [],
    hasMore: false,
  }));
}

async function handleSync(
  request: Request,
  env: Env,
  requestId: string,
  session: CloudSession,
  db: D1Database,
  key: string,
): Promise<Response> {
  const body = await readBody(request, requestId);
  if (body instanceof Response) return body;
  if (body.protocolVersion !== PROTOCOL_VERSION) return protocolError(requestId);
  if (!exact(body, ['protocolVersion', 'deviceId', 'cursor', 'ops']) ||
    typeof body.deviceId !== 'string' || !UUID_V4.test(body.deviceId) ||
    !(body.cursor === null || (typeof body.cursor === 'string' && CURSOR.test(body.cursor))) ||
    !Array.isArray(body.ops) || body.ops.length > MAX_OPERATIONS) {
    return error(422, 'invalid_request', requestId);
  }
  const operations = body.ops.map(parseSyncOperation);
  if (operations.some((operation) => !operation)) return error(422, 'invalid_request', requestId);
  const valid = operations as SyncOperation[];
  await recordCloudMetric(db, 'sync_requests');
  if (new Set(valid.map((operation) => operation.opId)).size !== valid.length) {
    return error(422, 'invalid_request', requestId);
  }
  const sequence = await cursorSequence(db, key, session.userId, body.cursor as string | null, requestId);
  if (sequence instanceof Response) return sequence;
  const existing = await receipts(db, session.userId, valid);
  const hashed = await Promise.all(valid.map(async (operation) => ({
    ...operation,
    hash: await digest(stable(operation)),
  })));
  for (const operation of hashed) {
    const prior = existing.get(operation.opId);
    if (prior && !equal(prior.operation_hash, operation.hash)) {
      return error(422, 'invalid_request', requestId);
    }
  }
  const acknowledged = new Set(existing.keys());
  const pending = hashed.filter((operation) => !acknowledged.has(operation.opId));
  if (pending.length && env.CLOUD_SYNC_WRITES_ENABLED !== 'true') {
    await recordCloudMetric(db, 'sync_errors');
    return json({ error: 'sync_writes_disabled', requestId, retryAfterSeconds: 300 }, 503, {
      'Retry-After': '300',
    });
  }
  const knownDevice = await db.prepare(
    'SELECT revoked_at FROM sync_devices WHERE account_id = ?1 AND device_id = ?2',
  ).bind(session.userId, body.deviceId).first<{ revoked_at: number | null }>();
  if (knownDevice?.revoked_at !== null && knownDevice?.revoked_at !== undefined) {
    return error(403, 'forbidden', requestId);
  }
  const stale = await conflicts(db, session.userId, pending, acknowledged);
  if (stale.length) {
    await recordCloudMetric(db, 'sync_conflicts');
    return conflictResponse(requestId, stale);
  }
  if (pending.length) {
    try {
      await db.batch(receiptStatements(db, session.userId, body.deviceId, pending, Date.now()));
    } catch {
      const after = await receipts(db, session.userId, pending);
      if (after.size !== pending.length || pending.some((operation) => after.get(operation.opId)?.operation_hash !== operation.hash)) {
        const raced = await conflicts(db, session.userId, pending, new Set(after.keys()));
        if (raced.length) {
          await recordCloudMetric(db, 'sync_conflicts');
          return conflictResponse(requestId, raced);
        }
        await recordCloudMetric(db, 'sync_errors');
        return error(409, 'revision_conflict', requestId);
      }
    }
    await recordCloudMetric(db, 'sync_operations', pending.length);
    await writeRecoverySnapshot(env, session.userId).catch(async () => {
      await recordCloudMetric(db, 'recovery_errors');
    });
  }
  const result = await readPage(db, key, session.userId, sequence, DEFAULT_PAGE_SIZE, {
    protocolVersion: 1,
    acknowledged: valid.map((operation) => operation.opId),
    changes: [],
    hasMore: false,
    serverTime: new Date().toISOString(),
  });
  return json(result);
}

async function handleRevoke(request: Request, requestId: string, session: CloudSession, db: D1Database): Promise<Response> {
  const body = await readBody(request, requestId);
  if (body instanceof Response) return body;
  if (body.protocolVersion !== PROTOCOL_VERSION) return protocolError(requestId);
  if (!exact(body, ['protocolVersion', 'deviceId']) || typeof body.deviceId !== 'string' || !UUID_V4.test(body.deviceId)) {
    return error(422, 'invalid_request', requestId);
  }
  await db.prepare(
    'UPDATE sync_devices SET revoked_at = ?1 WHERE account_id = ?2 AND device_id = ?3 AND revoked_at IS NULL',
  ).bind(Date.now(), session.userId, body.deviceId).run();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleDelete(request: Request, env: Env, requestId: string, session: CloudSession, db: D1Database): Promise<Response> {
  const body = await readBody(request, requestId);
  if (body instanceof Response) return body;
  if (body.protocolVersion !== PROTOCOL_VERSION) return protocolError(requestId);
  if (!exact(body, ['protocolVersion', 'confirmation']) || body.confirmation !== 'DELETE') {
    return error(422, 'invalid_request', requestId);
  }
  if (!(await deleteRecoverySnapshot(env, session.userId))) {
    return error(503, 'recovery_unavailable', requestId);
  }
  await db.prepare('DELETE FROM "user" WHERE id = ?1').bind(session.userId).run();
  const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  for (const name of [sessionCookieName(env), CSRF_COOKIE, DEVICE_COOKIE]) {
    response.headers.append('Set-Cookie', `${name}=; Path=/; Secure; SameSite=Strict; Max-Age=0`);
  }
  return response;
}

export async function handleCloudSync(
  request: Request,
  env: Env,
  requestId: string,
  sessionOverride?: CloudSession,
): Promise<Response> {
  const db = env.ANILIFE_CLOUD_DB;
  const key = env.SYNC_CURSOR_KEY;
  if (!db || !key || key.length < 32 || (!sessionOverride && !authConfigured(env))) {
    return error(503, 'service_unavailable', requestId);
  }
  const protocol = request.headers.get('X-Anilife-Protocol-Version');
  if (protocol && protocol !== String(PROTOCOL_VERSION)) return protocolError(requestId);
  const session = sessionOverride ?? await getCloudSession(request, env);
  if (!session) return error(401, 'authentication_required', requestId);
  const path = new URL(request.url).pathname;
  const methods = new Map([
    ['/api/v1/bootstrap', 'GET'],
    ['/api/v1/sync', 'POST'],
    ['/api/v1/export', 'GET'],
    ['/api/v1/devices/revoke', 'POST'],
    ['/api/v1/account', 'DELETE'],
  ]);
  const expected = methods.get(path);
  if (!expected) return error(404, 'invalid_request', requestId);
  if (request.method !== expected) return json({ error: 'invalid_request', requestId }, 405, { Allow: expected });
  const limited = hit(`cloud:${session.userId}:${path}`, 120, 60_000);
  if (!limited.allowed) return rateLimited(requestId, limited.retryAfterSec);
  if (expected !== 'GET' && !(await mutationAllowed(request, env, session, key))) {
    return error(403, 'forbidden', requestId);
  }
  if (path === '/api/v1/bootstrap') return handleBootstrap(request, env, requestId, session, db, key);
  if (path === '/api/v1/export') return handleExport(request, requestId, session, db, key);
  if (path === '/api/v1/sync') return handleSync(request, env, requestId, session, db, key);
  if (path === '/api/v1/devices/revoke') return handleRevoke(request, requestId, session, db);
  return handleDelete(request, env, requestId, session, db);
}
