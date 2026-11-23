import { getRecord, openDatabase, putRecord } from '../data/idb';
import type { CloudChange, CloudOperation, CloudShadow, LocalCloudSnapshot } from './model';
import { applyChangesToShadow, cloudKey, desiredCloudEntities } from './model';

const STORE = 'cloud_sync';
const CSRF_COOKIE = '__Host-anilife-csrf';

export interface CloudUser {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
}

export interface PendingOperation extends CloudOperation {
  attempted: boolean;
}

export interface CloudAccountState {
  enabled: boolean;
  initialized: boolean;
  cursor: string | null;
  deviceId: string | null;
  profileMap: Record<string, string>;
  shadow: Record<string, CloudShadow>;
  outbox: PendingOperation[];
  lastSyncedAt: number | null;
}

export interface BootstrapResult {
  deviceId: string;
  cursor: string;
  changes: CloudChange[];
}

export class CloudSyncError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'CloudSyncError';
  }
}

export function retryDelayMs(error: CloudSyncError, attempt: number, jitter = Math.random()): number | null {
  const spread = Math.floor(Math.max(0, Math.min(1, jitter)) * 1_000);
  if (error.status === 429) {
    return error.retryAfterSeconds === undefined ? null : (error.retryAfterSeconds * 1_000) + spread;
  }
  if (error.status >= 500) return Math.min(300_000, 5_000 * (2 ** Math.min(6, attempt))) + spread;
  return null;
}

export function emptyCloudState(): CloudAccountState {
  return {
    enabled: false,
    initialized: false,
    cursor: null,
    deviceId: null,
    profileMap: {},
    shadow: {},
    outbox: [],
    lastSyncedAt: null,
  };
}

export async function loadCloudState(accountId: string): Promise<CloudAccountState> {
  return (await getRecord<CloudAccountState>(STORE, `account:${accountId}`)) ?? emptyCloudState();
}

export async function loadCloudSnapshot(accountId: string): Promise<LocalCloudSnapshot | null> {
  return getRecord<LocalCloudSnapshot>(STORE, `local:${accountId}`);
}

export async function saveCloudSnapshot(accountId: string, snapshot: LocalCloudSnapshot): Promise<void> {
  await putRecord(STORE, `local:${accountId}`, snapshot);
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Cloud Sync local transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Cloud Sync local transaction aborted'));
  });
}

function stored(key: string, value: unknown) {
  return { key, value, updatedAt: Date.now() };
}

export async function saveCloudState(
  accountId: string,
  state: CloudAccountState,
  snapshot?: LocalCloudSnapshot,
): Promise<void> {
  const db = await openDatabase();
  const stores = snapshot
    ? [STORE, 'settings', 'profiles', 'watchlist', 'history']
    : [STORE];
  const tx = db.transaction(stores, 'readwrite');
  tx.objectStore(STORE).put(stored(`account:${accountId}`, state));
  if (snapshot) {
    tx.objectStore(STORE).put(stored(`local:${accountId}`, snapshot));
    tx.objectStore('settings').put(stored('settings', snapshot.settings));
    tx.objectStore('profiles').put(stored('profiles', snapshot.profiles));
    for (const profile of snapshot.profiles) {
      tx.objectStore('watchlist').put(stored(profile.id, snapshot.watchlist[profile.id] ?? []));
      tx.objectStore('history').put(stored(profile.id, snapshot.history[profile.id] ?? []));
    }
  }
  await txComplete(tx);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function operationKey(operation: Pick<CloudOperation, 'profileId' | 'entityType' | 'entityKey'>): string {
  return cloudKey(operation.profileId, operation.entityType, operation.entityKey);
}

export function stageSnapshot(state: CloudAccountState, snapshot: LocalCloudSnapshot): CloudAccountState {
  if (!state.enabled || !state.initialized) return state;
  const profileMap = { ...state.profileMap };
  for (const profile of snapshot.profiles) {
    profileMap[profile.id] ??= crypto.randomUUID();
  }
  const desired = desiredCloudEntities(snapshot, profileMap);
  const outbox = state.outbox.map((operation) => ({ ...operation }));
  const keys = new Set([...Object.keys(state.shadow), ...desired.keys()]);

  for (const key of keys) {
    const target = desired.get(key);
    const shadow = state.shadow[key];
    const pending = outbox.filter((operation) => operationKey(operation) === key);
    const effective = pending.at(-1) ?? shadow;
    const action = target?.action ?? 'delete';
    const value = target?.value;
    if (effective && effective.action === action && sameValue(effective.value, value)) continue;

    const replaceable = pending.at(-1);
    if (replaceable && !replaceable.attempted) {
      replaceable.action = action;
      if (value) replaceable.value = value;
      else delete replaceable.value;
      continue;
    }

    const source = target ?? (() => {
      const [profileId, entityType, entityKey] = key.split('\0');
      return { profileId, entityType: entityType as CloudOperation['entityType'], entityKey, action: 'delete' as const };
    })();
    outbox.push({
      ...source,
      opId: crypto.randomUUID(),
      baseRevision: (shadow?.revision ?? 0) + pending.length,
      attempted: false,
      ...(value ? { value } : {}),
    });
  }
  return { ...state, profileMap, outbox };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}));
  return body && typeof body === 'object' ? body as Record<string, unknown> : {};
}

async function checked(response: Response): Promise<Record<string, unknown>> {
  const body = await responseJson(response);
  if (!response.ok) {
    const headerDelay = Number(response.headers.get('Retry-After'));
    throw new CloudSyncError(
      response.status,
      typeof body.error === 'string' ? body.error : 'service_unavailable',
      typeof body.retryAfterSeconds === 'number'
        ? body.retryAfterSeconds
        : Number.isFinite(headerDelay) && headerDelay >= 0 ? headerDelay : undefined,
      body,
    );
  }
  return body;
}

export async function getCloudUser(): Promise<CloudUser | null> {
  const response = await fetch('/api/auth/get-session', { credentials: 'include', cache: 'no-store' });
  if (!response.ok) return null;
  const body = await responseJson(response);
  const user = body.user;
  if (!user || typeof user !== 'object' || typeof (user as Record<string, unknown>).id !== 'string') return null;
  return user as unknown as CloudUser;
}

export async function beginCloudSignIn(): Promise<void> {
  const body = await checked(await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'discord', callbackURL: `${window.location.origin}/settings` }),
  }));
  if (typeof body.url !== 'string' || !body.url.startsWith('https://discord.com/')) {
    throw new CloudSyncError(502, 'invalid_auth_redirect');
  }
  window.location.assign(body.url);
}

export async function signOutCloud(): Promise<void> {
  await checked(await fetch('/api/auth/sign-out', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }));
}

function cookieValue(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
}

export async function bootstrapCloud(cursor: string | null = null): Promise<BootstrapResult> {
  const changes: CloudChange[] = [];
  let next = cursor;
  let deviceId = '';
  for (let page = 0; page < 100; page += 1) {
    const query = next ? `?cursor=${encodeURIComponent(next)}&limit=250` : '?limit=250';
    const body = await checked(await fetch(`/api/v1/bootstrap${query}`, { credentials: 'include', cache: 'no-store' }));
    if (typeof body.deviceId !== 'string' || typeof body.cursor !== 'string' || !Array.isArray(body.changes)) {
      throw new CloudSyncError(502, 'invalid_sync_response');
    }
    deviceId = body.deviceId;
    next = body.cursor;
    changes.push(...body.changes as CloudChange[]);
    if (body.hasMore !== true) return { deviceId, cursor: next, changes };
  }
  throw new CloudSyncError(502, 'sync_page_limit');
}

interface SyncPage {
  state: CloudAccountState;
  changes: CloudChange[];
  hasMore: boolean;
}

export async function pushPullCloud(accountId: string, state: CloudAccountState): Promise<SyncPage> {
  if (!state.deviceId) throw new CloudSyncError(400, 'device_missing');
  const csrf = cookieValue(CSRF_COOKIE);
  if (!csrf) throw new CloudSyncError(403, 'csrf_missing');
  const batch = state.outbox.slice(0, 50);
  const attempted = new Set(batch.map((operation) => operation.opId));
  const durable = {
    ...state,
    outbox: state.outbox.map((operation) => attempted.has(operation.opId) ? { ...operation, attempted: true } : operation),
  };
  await saveCloudState(accountId, durable);
  // A lost response must never let a later local edit reuse this operation ID with new content.
  state.outbox = durable.outbox;
  const body = await checked(await fetch('/api/v1/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Anilife-CSRF': csrf },
    body: JSON.stringify({
      protocolVersion: 1,
      deviceId: state.deviceId,
      cursor: state.cursor,
      ops: batch.map(({ attempted: _attempted, ...operation }) => operation),
    }),
  }));
  if (typeof body.cursor !== 'string' || !Array.isArray(body.acknowledged) || !Array.isArray(body.changes)) {
    throw new CloudSyncError(502, 'invalid_sync_response');
  }
  const acknowledged = new Set(body.acknowledged as string[]);
  const changes = body.changes as CloudChange[];
  const next: CloudAccountState = {
    ...durable,
    cursor: body.cursor,
    shadow: applyChangesToShadow(durable.shadow, changes),
    outbox: durable.outbox.filter((operation) => !acknowledged.has(operation.opId)),
    lastSyncedAt: Date.now(),
  };
  await saveCloudState(accountId, next);
  return { state: next, changes, hasMore: body.hasMore === true };
}

export async function revokeCloudDevice(state: CloudAccountState): Promise<void> {
  const csrf = cookieValue(CSRF_COOKIE);
  if (!csrf || !state.deviceId) throw new CloudSyncError(403, 'csrf_missing');
  const response = await fetch('/api/v1/devices/revoke', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Anilife-CSRF': csrf },
    body: JSON.stringify({ protocolVersion: 1, deviceId: state.deviceId }),
  });
  if (!response.ok) await checked(response);
}

export async function deleteCloudAccount(): Promise<void> {
  const csrf = cookieValue(CSRF_COOKIE);
  if (!csrf) throw new CloudSyncError(403, 'csrf_missing');
  const response = await fetch('/api/v1/account', {
    method: 'DELETE', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Anilife-CSRF': csrf },
    body: JSON.stringify({ protocolVersion: 1, confirmation: 'DELETE' }),
  });
  if (!response.ok) await checked(response);
}

export async function exportCloudData(): Promise<CloudChange[]> {
  const changes: CloudChange[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=250` : '?limit=250';
    const body = await checked(await fetch(`/api/v1/export${query}`, { credentials: 'include', cache: 'no-store' }));
    if (typeof body.cursor !== 'string' || !Array.isArray(body.changes)) throw new CloudSyncError(502, 'invalid_sync_response');
    cursor = body.cursor;
    changes.push(...body.changes as CloudChange[]);
    if (body.hasMore !== true) return changes;
  }
  throw new CloudSyncError(502, 'sync_page_limit');
}
