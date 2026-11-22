import test from 'node:test';
import assert from 'node:assert/strict';
import { queryAniList } from './anilistApi';
import { AniListRequestError } from './oauth';

test('AniList retries one rate-limited request and then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('{"errors":[{"message":"slow down"}]}', {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        })
      : new Response('{"data":{"Viewer":{"id":1}}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
  };

  try {
    assert.deepEqual(await queryAniList<{ Viewer: { id: number } }>('query { Viewer { id } }'), {
      Viewer: { id: 1 },
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AniList does not retry a bad request and preserves its status', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"errors":[{"message":"bad query"}]}', {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      queryAniList('bad query'),
      (error: unknown) => error instanceof AniListRequestError && error.status === 400,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
