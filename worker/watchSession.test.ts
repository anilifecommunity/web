import assert from 'node:assert/strict';
import test from 'node:test';
import { createWatchSession, verifyWatchSession, WATCH_TTL_SECONDS } from './watchSession';

test('watch authorizations are opaque, stable per anime and bound to the browser session', async () => {
  const created = await createWatchSession('primary-secret', 'viewer-a', 154587, 1_000);
  const repeated = await createWatchSession('primary-secret', 'viewer-a', 154587, 2_000);
  const anotherAnime = await createWatchSession('primary-secret', 'viewer-a', 1, 1_000);
  assert.equal(created.reference, repeated.reference);
  assert.equal(created.tag, repeated.tag);
  assert.notEqual(created.reference, anotherAnime.reference);
  assert.doesNotMatch(`${created.reference}${created.tag}`, /154587|viewer-a/);
  assert.equal(created.expiresAt, 1_000 + WATCH_TTL_SECONDS);
  assert.deepEqual(
    await verifyWatchSession(
      ['primary-secret'],
      'viewer-a',
      { reference: created.reference, tag: created.tag, aniListId: 154587 },
      1_001
    ),
    { ok: true, aniListId: 154587, expiresAt: 1_001 + WATCH_TTL_SECONDS }
  );
});

test('copied, tampered and changed-anime authorizations fail closed', async () => {
  const created = await createWatchSession('primary-secret', 'viewer-a', 154587, 1_000);
  const expected = { reference: created.reference, tag: created.tag, aniListId: 154587 };
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-b', expected, 1_001),
    { ok: false, reason: 'mismatch' }
  );
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-a', { ...expected, tag: '000000000000' }, 1_001),
    { ok: false, reason: 'mismatch' }
  );
  assert.deepEqual(
    await verifyWatchSession(['primary-secret'], 'viewer-a', { ...expected, aniListId: 1 }, 1_001),
    { ok: false, reason: 'mismatch' }
  );
});

test('gate expiry and the previous rotation key are honored', async () => {
  const created = await createWatchSession('previous-secret', '5000.nonce.signature', 1, 1_000);
  assert.equal(created.expiresAt, 5_000);
  const result = await verifyWatchSession(
    ['current-secret', 'previous-secret'],
    '5000.nonce.signature',
    { reference: created.reference, tag: created.tag, aniListId: 1 },
    1_001
  );
  assert.deepEqual(result, { ok: true, aniListId: 1, expiresAt: 5_000 });
});
