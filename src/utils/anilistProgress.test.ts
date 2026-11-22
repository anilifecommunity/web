import test from 'node:test';
import assert from 'node:assert/strict';
import { createAniListProgressQueue } from './anilistProgress';

test('AniList progress sends each monotonic value once', async () => {
  const sent: number[] = [];
  const enqueue = createAniListProgressQueue(async (_mediaId, progress) => void sent.push(progress));

  await enqueue(1, 3);
  await enqueue(1, 3);
  await enqueue(1, 2);

  assert.deepEqual(sent, [3]);
});

test('AniList progress serializes requests and keeps the newest pending value', async () => {
  const sent: number[] = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const enqueue = createAniListProgressQueue(async (_mediaId, progress) => {
    sent.push(progress);
    if (progress === 1) await first;
  });

  const initial = enqueue(1, 1);
  const newer = enqueue(1, 4);
  assert.deepEqual(sent, [1]);
  release();
  await Promise.all([initial, newer]);

  assert.deepEqual(sent, [1, 4]);
});

test('AniList progress backs off after failure and retries later', async () => {
  let clock = 0;
  let calls = 0;
  const enqueue = createAniListProgressQueue(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary');
  }, () => clock, 100);

  await assert.rejects(enqueue(1, 2), /temporary/);
  await enqueue(1, 2);
  assert.equal(calls, 1);
  clock = 100;
  await enqueue(1, 2);
  assert.equal(calls, 2);
});
