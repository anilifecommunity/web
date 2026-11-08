import { STORAGE_KEYS } from './keys';

/**
 * Durable local store.
 *
 * localStorage remains the synchronous boot cache the existing UI reads, but every write is also
 * mirrored here, and a boot with an empty localStorage is hydrated from IndexedDB before React
 * mounts. Nothing is deleted from localStorage during migration, so rolling the code back cannot
 * lose the viewer's data.
 */

const DB_NAME = 'anilife';
const DB_VERSION = 1;

export const STORES = [
  'app_meta',
  'profiles',
  'settings',
  'watchlist',
  'history',
  'search_history',
  'diagnostics_local',
] as const;

export type StoreName = (typeof STORES)[number];

interface StoredRecord<T> {
  key: string;
  value: T;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB is unavailable'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'key' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function putRecord<T>(store: StoreName, key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put({ key, value, updatedAt: Date.now() } satisfies StoredRecord<T>);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } catch (error) {
    // The mirror must never break the UI. localStorage still holds the write.
    console.warn('[idb] write failed', error);
  }
}

export async function getRecord<T>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(store, 'readonly');
    const result = await requestToPromise(tx.objectStore(store).get(key) as IDBRequest<StoredRecord<T> | undefined>);
    return result?.value ?? null;
  } catch {
    return null;
  }
}

export async function getAllRecords<T>(store: StoreName): Promise<Array<{ key: string; value: T }>> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(store, 'readonly');
    const rows = await requestToPromise(tx.objectStore(store).getAll() as IDBRequest<Array<StoredRecord<T>>>);
    return rows.map((row) => ({ key: row.key, value: row.value }));
  } catch {
    return [];
  }
}

export interface MigrationReceipt {
  from: 'localStorage-v3';
  at: number;
  counts: Record<string, number>;
}

export interface HydrationReport {
  restored: string[];
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeIfMissing(key: string, value: unknown): boolean {
  try {
    if (localStorage.getItem(key) !== null) return false;
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies the live localStorage document into IndexedDB. Idempotent: every run writes the same
 * records, and the receipt records when the first successful pass happened.
 */
export async function migrateLocalStorageToIdb(): Promise<MigrationReceipt | null> {
  if (!hasIndexedDb() || typeof localStorage === 'undefined') return null;

  const counts: Record<string, number> = {
    settings: 0,
    profiles: 0,
    watchlist: 0,
    history: 0,
    search_history: 0,
  };

  const settings = readJson<Record<string, unknown>>(STORAGE_KEYS.SETTINGS);
  if (settings) {
    await putRecord('settings', 'settings', settings);
    counts.settings = 1;
  }

  const profiles = readJson<unknown[]>(STORAGE_KEYS.PROFILES);
  if (Array.isArray(profiles)) {
    await putRecord('profiles', 'profiles', profiles);
    counts.profiles = profiles.length;
    for (const profile of profiles as Array<{ id?: string }>) {
      if (!profile || typeof profile.id !== 'string') continue;
      const watchlist = readJson<unknown[]>(`${STORAGE_KEYS.WATCHLIST_PREFIX}${profile.id}`);
      if (Array.isArray(watchlist)) {
        await putRecord('watchlist', profile.id, watchlist);
        counts.watchlist += watchlist.length;
      }
      const history = readJson<unknown[]>(`${STORAGE_KEYS.CONTINUE_PREFIX}${profile.id}`);
      if (Array.isArray(history)) {
        await putRecord('history', profile.id, history);
        counts.history += history.length;
      }
      const searches = readJson<unknown[]>(`${STORAGE_KEYS.SEARCH_PREFIX}${profile.id}`);
      if (Array.isArray(searches)) {
        await putRecord('search_history', profile.id, searches);
        counts.search_history += searches.length;
      }
    }
  }

  const active = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
  if (active) await putRecord('app_meta', 'activeProfileId', active);

  const existing = await getRecord<MigrationReceipt>('app_meta', 'migration-localStorage-v3');
  const receipt: MigrationReceipt = existing ?? {
    from: 'localStorage-v3',
    at: Date.now(),
    counts,
  };
  await putRecord('app_meta', 'migration-localStorage-v3', receipt);
  return receipt;
}

/**
 * Restores any missing localStorage key from IndexedDB. Existing keys always win, so this cannot
 * overwrite a newer write from the current tab or another tab.
 */
export async function hydrateLocalStorageFromIdb(): Promise<HydrationReport> {
  const restored: string[] = [];
  if (!hasIndexedDb() || typeof localStorage === 'undefined') return { restored };

  const settings = await getRecord<Record<string, unknown>>('settings', 'settings');
  if (settings && writeIfMissing(STORAGE_KEYS.SETTINGS, settings)) restored.push(STORAGE_KEYS.SETTINGS);

  const profiles = await getRecord<unknown[]>('profiles', 'profiles');
  if (profiles && writeIfMissing(STORAGE_KEYS.PROFILES, profiles)) restored.push(STORAGE_KEYS.PROFILES);

  const active = await getRecord<string>('app_meta', 'activeProfileId');
  if (typeof active === 'string' && writeIfMissing(STORAGE_KEYS.ACTIVE_PROFILE_ID, active)) {
    restored.push(STORAGE_KEYS.ACTIVE_PROFILE_ID);
  }

  for (const { key, value } of await getAllRecords<unknown[]>('watchlist')) {
    if (writeIfMissing(`${STORAGE_KEYS.WATCHLIST_PREFIX}${key}`, value)) {
      restored.push(`${STORAGE_KEYS.WATCHLIST_PREFIX}${key}`);
    }
  }
  for (const { key, value } of await getAllRecords<unknown[]>('history')) {
    if (writeIfMissing(`${STORAGE_KEYS.CONTINUE_PREFIX}${key}`, value)) {
      restored.push(`${STORAGE_KEYS.CONTINUE_PREFIX}${key}`);
    }
  }
  for (const { key, value } of await getAllRecords<unknown[]>('search_history')) {
    if (writeIfMissing(`${STORAGE_KEYS.SEARCH_PREFIX}${key}`, value)) {
      restored.push(`${STORAGE_KEYS.SEARCH_PREFIX}${key}`);
    }
  }

  return { restored };
}

/** Best-effort protection against browser eviction. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
    }
  } catch {}
  return null;
}


