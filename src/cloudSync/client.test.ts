import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../utils/storage';
import { CloudSyncError, emptyCloudState, loadCloudSnapshot, loadCloudState, pushPullCloud, retryDelayMs, saveCloudSnapshot, stageSnapshot } from './client';
import type { LocalCloudSnapshot } from './model';

const snapshot: LocalCloudSnapshot = {
  profiles: [{ id: 'local', name: 'Local', avatar: 'a', accentColor: '#74cf66' }],
  activeProfileId: 'local',
  settings: { ...DEFAULT_SETTINGS },
  watchlist: {},
  history: {},
};

test('disabled Cloud Sync never queues local data', () => {
  assert.equal(stageSnapshot(emptyCloudState(), snapshot).outbox.length, 0);
});

test('staging creates stable portable operations and coalesces unattempted edits', () => {
  const active = { ...emptyCloudState(), enabled: true, initialized: true };
  const first = stageSnapshot(active, snapshot);
  assert.ok(first.profileMap.local);
  assert.equal(first.outbox.length, 20);
  const changed = stageSnapshot(first, { ...snapshot, profiles: [{ ...snapshot.profiles[0], name: 'Changed' }] });
  assert.equal(changed.outbox.length, 20);
  assert.equal(changed.outbox.find((operation) => operation.entityType === 'profile')?.value?.name, 'Changed');
});

test('an attempted operation is never mutated after a possible lost response', () => {
  const active = stageSnapshot({ ...emptyCloudState(), enabled: true, initialized: true }, snapshot);
  active.outbox[0].attempted = true;
  const changed = stageSnapshot(active, { ...snapshot, profiles: [{ ...snapshot.profiles[0], name: 'Changed' }] });
  assert.equal(changed.outbox.length, 21);
  assert.equal(changed.outbox[0].value?.name, 'Local');
  assert.equal(changed.outbox.at(-1)?.value?.name, 'Changed');
});

test('a failed sync durably marks sent operations before the request', async () => {
  const accountId = crypto.randomUUID();
  const state = stageSnapshot({
    ...emptyCloudState(),
    enabled: true,
    initialized: true,
    deviceId: crypto.randomUUID(),
  }, snapshot);
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    value: { cookie: '__Host-anilife-csrf=test-csrf' },
    configurable: true,
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'service_unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(pushPullCloud(accountId, state), /service_unavailable/);
    const durable = await loadCloudState(accountId);
    assert.equal(durable.outbox.length, state.outbox.length);
    assert.equal(durable.outbox.every((operation) => operation.attempted), true);
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, 'document', { value: previousDocument, configurable: true });
  }
});

test('account-local snapshots stay partitioned', async () => {
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  await saveCloudSnapshot(first, snapshot);
  await saveCloudSnapshot(second, { ...snapshot, profiles: [{ ...snapshot.profiles[0], name: 'Second' }] });
  assert.equal((await loadCloudSnapshot(first))?.profiles[0].name, 'Local');
  assert.equal((await loadCloudSnapshot(second))?.profiles[0].name, 'Second');
});

test('retry timing honors rate-limit windows and bounds transient backoff', () => {
  assert.equal(retryDelayMs(new CloudSyncError(429, 'rate_limited'), 0, 0), null);
  assert.equal(retryDelayMs(new CloudSyncError(429, 'rate_limited', 12), 0, 0.5), 12_500);
  assert.equal(retryDelayMs(new CloudSyncError(503, 'unavailable'), 10, 1), 301_000);
  assert.equal(retryDelayMs(new CloudSyncError(401, 'expired'), 0, 0), null);
});
