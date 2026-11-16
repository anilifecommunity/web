import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { loadActiveProfileId, loadSettings, saveActiveProfileId, STORAGE_KEYS } from './storage';
import { webServerOptions } from './providerOptions';

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
  } as Storage;
}

const webIds = webServerOptions().map((server) => server.id);

function withStoredSettings(settings: Record<string, unknown>): void {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

test('an unversioned server order is migrated to web-capable order', () => {
  withStoredSettings({
    serverPriority: [...webIds].reverse(),
    enabledServers: [...webIds].reverse(),
  });
  const loaded = loadSettings();
  assert.deepEqual(loaded.serverPriority, webIds);
  assert.equal(loaded.serverOrderVersion, 2);
});

test('a versioned order is preserved exactly', () => {
  const custom = [...webIds].reverse();
  withStoredSettings({
    serverPriority: custom,
    enabledServers: custom,
    serverOrderVersion: 2,
    serverCatalogVersion: 3,
  });
  const loaded = loadSettings();
  assert.deepEqual(loaded.serverPriority, custom);
});

test('an explicit disable survives and is not re-added', () => {
  withStoredSettings({
    enabledServers: [webIds[0]],
    serverOrderVersion: 2,
    serverCatalogVersion: 3,
  });
  const loaded = loadSettings();
  assert.deepEqual(loaded.enabledServers, [webIds[0]]);
});

test('an empty enable list means every web-capable server', () => {
  withStoredSettings({
    enabledServers: [],
    serverOrderVersion: 2,
    serverCatalogVersion: 3,
  });
  const loaded = loadSettings();
  assert.deepEqual(loaded.enabledServers, webIds);
});

test('a legacy enable list drops failed servers and gains verified fallbacks', () => {
  withStoredSettings({
    enabledServers: ['reanime', 'vidsrc'],
    serverOrderVersion: 2,
  });
  const loaded = loadSettings();
  assert.ok(loaded.enabledServers.includes('vidlink'));
  assert.ok(!loaded.enabledServers.includes('vidsrc'));
  assert.ok(!loaded.enabledServers.includes('2embed'));
  assert.ok(loaded.enabledServers.includes('zoko'));
  assert.ok(loaded.enabledServers.includes('animeembed'));
  assert.equal(loaded.serverCatalogVersion, 3);
});

test('the previous catalogue gains verified v3 servers without resetting existing choices', () => {
  withStoredSettings({
    enabledServers: ['reanime'],
    serverOrderVersion: 2,
    serverCatalogVersion: 2,
  });
  const loaded = loadSettings();
  assert.deepEqual(loaded.enabledServers, ['reanime', 'zoko', 'animeembed']);
  assert.equal(loaded.serverCatalogVersion, 3);
  const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
  assert.deepEqual(persisted.enabledServers, loaded.enabledServers);
  assert.equal(persisted.serverCatalogVersion, 3);
});

test('new viewers hide adult content while an explicit opt-in is preserved', () => {
  withStoredSettings({});
  assert.equal(loadSettings().hideAdultContent, true);
  assert.equal(loadSettings().activeServer, 'zoko');

  withStoredSettings({ hideAdultContent: false });
  assert.equal(loadSettings().hideAdultContent, false);
});

test('the selected profile survives a browser reload', () => {
  withStoredSettings({});
  saveActiveProfileId('profile-brave');
  assert.equal(loadActiveProfileId(), 'profile-brave');
});
