import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, STORAGE_KEYS } from './storage';
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
  withStoredSettings({ serverPriority: custom, enabledServers: custom, serverOrderVersion: 2 });
  const loaded = loadSettings();
  assert.deepEqual(loaded.serverPriority, custom);
});

test('an explicit disable survives and is not re-added', () => {
  withStoredSettings({ enabledServers: [webIds[0]], serverOrderVersion: 2 });
  const loaded = loadSettings();
  assert.deepEqual(loaded.enabledServers, [webIds[0]]);
});

test('an empty enable list means every web-capable server', () => {
  withStoredSettings({ enabledServers: [], serverOrderVersion: 2 });
  const loaded = loadSettings();
  assert.deepEqual(loaded.enabledServers, webIds);
});
