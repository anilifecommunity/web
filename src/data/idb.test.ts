import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteRecord,
  getAllRecords,
  getRecord,
  hydrateLocalStorageFromIdb,
  migrateLocalStorageToIdb,
  putRecord,
} from './idb';
import { STORAGE_KEYS } from './keys';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  };
}

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });

test('records round-trip through IndexedDB', async () => {
  await putRecord('settings', 'test-key', { hello: 'world' });
  assert.deepEqual(await getRecord('settings', 'test-key'), { hello: 'world' });
  assert.equal(await getRecord('settings', 'missing'), null);
});

test('a queued delete wins over an earlier write to the same profile record', async () => {
  const write = putRecord('history', 'profile-delete', [{ animeId: '1' }]);
  const deletion = deleteRecord('history', 'profile-delete');
  await Promise.all([write, deletion]);
  assert.equal(await getRecord('history', 'profile-delete'), null);
});

test('verified Media Index records use their own non-profile store', async () => {
  await putRecord('media_index', 'release:rel-0123456789abcdef:catalog/home.json', {
    verifiedAt: 1,
    value: { rows: {} },
  });
  assert.deepEqual(
    await getRecord('media_index', 'release:rel-0123456789abcdef:catalog/home.json'),
    { verifiedAt: 1, value: { rows: {} } },
  );
});

test('migration copies settings, profiles and per-profile rows', async () => {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ watchedThreshold: 80 }));
  localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify([{ id: 'profile-main', name: 'Profile 1' }]));
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, 'profile-main');
  localStorage.setItem(
    `${STORAGE_KEYS.WATCHLIST_PREFIX}profile-main`,
    JSON.stringify([{ animeId: '1', status: 'Watching' }])
  );
  localStorage.setItem(
    `${STORAGE_KEYS.CONTINUE_PREFIX}profile-main`,
    JSON.stringify([{ animeId: '1', episodeNumber: 3 }])
  );
  localStorage.setItem(`${STORAGE_KEYS.SEARCH_PREFIX}profile-main`, JSON.stringify(['Frieren']));

  const receipt = await migrateLocalStorageToIdb();
  assert.ok(receipt);
  assert.equal(receipt?.from, 'localStorage-v3');
  assert.equal(receipt?.counts.watchlist, 1);
  assert.equal(receipt?.counts.history, 1);
  assert.equal(receipt?.counts.search_history, 1);

  assert.deepEqual(await getRecord('settings', 'settings'), { watchedThreshold: 80 });
  assert.deepEqual(await getRecord('profiles', 'profiles'), [{ id: 'profile-main', name: 'Profile 1' }]);
  assert.equal(await getRecord('app_meta', 'activeProfileId'), 'profile-main');
  assert.deepEqual(await getAllRecords('watchlist'), [
    { key: 'profile-main', value: [{ animeId: '1', status: 'Watching' }] },
  ]);
});

test('hydration restores missing keys and never overwrites existing ones', async () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ watchedThreshold: 55 }));

  const report = await hydrateLocalStorageFromIdb();
  assert.ok(report.restored.includes(STORAGE_KEYS.PROFILES));
  assert.ok(report.restored.includes(`${STORAGE_KEYS.WATCHLIST_PREFIX}profile-main`));
  // The existing settings key wins over the value stored in IndexedDB.
  assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)!), { watchedThreshold: 55 });
  assert.equal(localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID), 'profile-main');
});

test('hydration never resurrects data for a deleted profile', async () => {
  await putRecord('profiles', 'profiles', [{ id: 'profile-main', name: 'Profile 1' }]);
  await putRecord('history', 'profile-deleted', [{ animeId: '9', episodeNumber: 2 }]);
  localStorage.clear();

  await hydrateLocalStorageFromIdb();

  assert.equal(localStorage.getItem(`${STORAGE_KEYS.CONTINUE_PREFIX}profile-deleted`), null);
  await deleteRecord('history', 'profile-deleted');
});

test('migration is idempotent', async () => {
  const first = await migrateLocalStorageToIdb();
  const second = await migrateLocalStorageToIdb();
  assert.deepEqual(second?.counts, first?.counts);
  assert.equal((await getAllRecords('history')).length, 1);
});
