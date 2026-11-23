import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../utils/storage';
import { applyChangesToShadow, desiredCloudEntities, mergeRemoteChanges, type LocalCloudSnapshot } from './model';

const local: LocalCloudSnapshot = {
  profiles: [{ id: 'default', name: 'Local', avatar: 'avatar', accentColor: '#74cf66', pin: '1234' }],
  activeProfileId: 'default',
  settings: { ...DEFAULT_SETTINGS },
  watchlist: { default: [{ animeId: '21', status: 'Watching', updatedAt: 'now', progress: 3 }] },
  history: { default: [{ animeId: '21', episodeNumber: 4, currentTimeSec: 120, durationSec: 1440, serverName: 'zoko', audioMode: 'SUB', updatedAt: 'now' }] },
};

test('portable mapping excludes PINs and provider-specific settings', () => {
  const entities = desiredCloudEntities(local, { default: '00000000-0000-4000-8000-000000000003' });
  const text = JSON.stringify([...entities.values()]);
  assert.equal(text.includes('1234'), false);
  assert.equal(text.includes('activeServer'), false);
  assert.equal(text.includes('serverPriority'), false);
  assert.equal(entities.size, 22);
});

test('initial merge never overwrites existing local rows and maps remote profiles', () => {
  const profileMap = { default: '00000000-0000-4000-8000-000000000003' };
  const merged = mergeRemoteChanges(local, [{
    profileId: profileMap.default,
    entityType: 'watchlist',
    entityKey: 'ANIME:al-21',
    action: 'upsert',
    revision: 2,
    value: { status: 'Paused' },
  }], profileMap, true);
  assert.equal(merged.watchlist.default[0].status, 'Watching');
});

test('subsequent remote changes update and delete local portable rows', () => {
  const profileMap = { default: '00000000-0000-4000-8000-000000000003' };
  const changed = mergeRemoteChanges(local, [{
    profileId: profileMap.default,
    entityType: 'watchlist',
    entityKey: 'ANIME:al-21',
    action: 'upsert',
    revision: 2,
    value: { status: 'Paused' },
  }], profileMap, false);
  assert.equal(changed.watchlist.default[0].status, 'Paused');
  const deleted = mergeRemoteChanges(changed, [{
    profileId: profileMap.default,
    entityType: 'watchlist',
    entityKey: 'ANIME:al-21',
    action: 'delete',
    revision: 3,
  }], profileMap, false);
  assert.equal(deleted.watchlist.default.length, 0);
});

test('shadow keeps only the newest revision', () => {
  const key = '00000000-0000-4000-8000-000000000003\0profile\0profile';
  const shadow = applyChangesToShadow({}, [
    { profileId: key.split('\0')[0], entityType: 'profile', entityKey: 'profile', action: 'upsert', revision: 2, value: { name: 'new' } },
    { profileId: key.split('\0')[0], entityType: 'profile', entityKey: 'profile', action: 'upsert', revision: 1, value: { name: 'old' } },
  ]);
  assert.equal(shadow[key].revision, 2);
  assert.deepEqual(shadow[key].value, { name: 'new' });
});
