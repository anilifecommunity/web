import assert from 'node:assert/strict';
import test from 'node:test';
import { createWatchSession, verifyWatchSession, WATCH_TTL_SECONDS } from './watchSession';

test('watch sessions are opaque, session-bound and reloadable', async () => {
  const created = await createWatchSession('primary-secret', 'viewer-a', 154587, 6, 1_000);
  assert.doesNotMatch(created.token, /154587|viewer-a/);
  const result = await verifyWatchSession(
    ['primary-secret'],
    'viewer-a',
    created.token,
    { reference: created.reference, tag: created.tag, aniListId: 154587, episode: 6 },
    1_001
  );
  assert.equal(result.ok, true);
});

test('copied, expired, tampered and changed watch sessions fail closed', async () => {
  const created = await createWatchSession('primary-secret', 'viewer-a', 154587, 6, 1_000);
  const expected = { reference: created.reference, tag: created.tag, aniListId: 154587, episode: 6 };
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-b', created.token, expected, 1_001),
    { ok: false, reason: 'wrong_session' }
  );
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-a', created.token, expected, 1_000 + WATCH_TTL_SECONDS),
    { ok: false, reason: 'expired' }
  );
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-a', `${created.token}x`, expected, 1_001),
    { ok: false, reason: 'invalid' }
  );
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-a', created.token, { ...expected, episode: 7 }, 1_001),
    { ok: false, reason: 'mismatch' }
  );
});

test('the previous key remains valid during rotation', async () => {
  const created = await createWatchSession('previous-secret', 'viewer-a', 1, 1, 1_000);
  const result = await verifyWatchSession(
    ['current-secret', 'previous-secret'],
    'viewer-a',
    created.token,
    { reference: created.reference, tag: created.tag, aniListId: 1, episode: 1 },
    1_001
  );
  assert.equal(result.ok, true);
});
