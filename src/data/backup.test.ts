import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyBackup,
  BackupError,
  openCredentials,
  parseBackup,
  sealCredentials,
  settingsFromAndroid,
  settingsToAndroid,
} from './backup';
import { DEFAULT_SETTINGS } from '../utils/storage';
import type { BackupDocument } from './backup';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/backup-sealed.json', import.meta.url), 'utf8')
) as {
  passphrase: string;
  file: {
    format: string;
    version: number;
    credentials: {
      kdf: string;
      iterations: number;
      salt: string;
      iv: string;
      ciphertext: string;
      services: string[];
    };
  };
};

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

test('opens the Android sealed-credentials fixture with the same passphrase', async () => {
  const credentials = await openCredentials(fixture.passphrase, fixture.file.credentials);
  const token = credentials.aniListToken ?? (credentials as unknown as { anilistToken?: string }).anilistToken;
  assert.equal(token, 'android-token');
  assert.equal(Boolean(credentials.malCode && credentials.malVerifier), true);
  assert.equal(credentials.malIssuedAt, 42);
});

test('seals and reopens credentials with Web Crypto', async () => {
  const sealed = await sealCredentials(
    'K7M4-9QXR',
    { aniListToken: 'web-token', malCode: 'c', malVerifier: 'v', malIssuedAt: 7 },
    1000
  );
  assert.equal(sealed.kdf, 'pbkdf2-hmac-sha256');
  assert.deepEqual(sealed.services, ['anilist', 'mal']);
  const opened = await openCredentials('K7M4-9QXR', sealed);
  assert.equal(opened.aniListToken, 'web-token');
  assert.equal(opened.malIssuedAt, 7);
});

test('a wrong passphrase fails closed', async () => {
  const sealed = await sealCredentials('K7M4-9QXR', { aniListToken: 'x' }, 1000);
  await assert.rejects(
    () => openCredentials('WRONG-PASS', sealed),
    (error: unknown) => error instanceof BackupError && error.code === 'BAK-01'
  );
});

test('short passphrases are refused', async () => {
  await assert.rejects(
    () => sealCredentials('short', { aniListToken: 'x' }, 1000),
    (error: unknown) => error instanceof BackupError
  );
});

test('parses the Android wire format and rejects other JSON', () => {
  const text = readFileSync(new URL('./fixtures/backup-sealed.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(text).file;
  const document = parseBackup(JSON.stringify(parsed));
  assert.equal(document.format, 'anilili-backup');
  assert.equal(document.version, 1);

  assert.throws(
    () => parseBackup('{"format":"something-else","version":1}'),
    (error: unknown) => error instanceof BackupError && error.code === 'BAK-03'
  );
  assert.throws(
    () => parseBackup('not json'),
    (error: unknown) => error instanceof BackupError && error.code === 'BAK-03'
  );
});

test('settings mapping round-trips the shared keys', () => {
  const android = settingsToAndroid(DEFAULT_SETTINGS);
  assert.equal(android.autoplay, DEFAULT_SETTINGS.autoPlayNext);
  assert.equal(android.watched_threshold_percent, DEFAULT_SETTINGS.watchedThreshold);
  assert.equal(android.prefer_dub, false);

  const back = settingsFromAndroid(android);
  assert.equal(back.autoPlayNext, DEFAULT_SETTINGS.autoPlayNext);
  assert.equal(back.watchedThreshold, DEFAULT_SETTINGS.watchedThreshold);
  assert.equal(back.defaultAudioMode, 'SUB');
  assert.deepEqual(back.serverPriority, DEFAULT_SETTINGS.serverPriority);
});

test('restoring merges history and watchlist without deleting local rows', () => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  try {
    localStorage.setItem('anilife_active_profile_id_v3', 'profile-main');
    localStorage.setItem(
      'anilife_continue_v3_profile-main',
      JSON.stringify([
        {
          animeId: '1',
          episodeNumber: 4,
          currentTimeSec: 30,
          durationSec: 1400,
          serverName: 'anichan',
          audioMode: 'SUB',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ])
    );

    const document: BackupDocument = {
      format: 'anilili-backup',
      version: 1,
      createdAt: Date.now(),
      appVersion: 'android',
      settings: { autoplay: false, watched_threshold_percent: 90 },
      watchlist: [{ anilistId: 2, status: 'Watching', addedAt: 10 }],
      history: [{ anilistId: 1, episodeNumber: 5, positionMs: 60000, durationMs: 1400000, updatedAt: Date.parse('2027-01-01T00:00:00.000Z') }],
      searchHistory: ['Frieren'],
      customLists: [],
      watched: [],
    };

    const summary = applyBackup(document);
    assert.equal(summary.watchlist, 1);
    assert.equal(summary.history, 1);
    assert.equal(summary.settings, 2);

    const history = JSON.parse(localStorage.getItem('anilife_continue_v3_profile-main')!);
    assert.equal(history.length, 1);
    assert.equal(history[0].animeId, '1');
    assert.equal(history[0].episodeNumber, 5);
    assert.equal(history[0].currentTimeSec, 60);

    const watchlist = JSON.parse(localStorage.getItem('anilife_watchlist_v3_profile-main')!);
    assert.equal(watchlist[0].animeId, '2');
    assert.equal(watchlist[0].status, 'Watching');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
  }
});
