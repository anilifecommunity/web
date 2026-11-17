import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMediaIndexEpisodes, isAnimeDubbed } from './mediaIndexApi';

test('episode metadata deduplicates concurrent work and retries a transient failure', async () => {
  const originalFetch = globalThis.fetch;
  let legacyCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/data/anime/424/424242/episodes.json')) {
      legacyCalls += 1;
      if (legacyCalls === 1) return new Response('', { status: 503 });
      return new Response(JSON.stringify([{ number: 1, title: 'Episode 1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 503 });
  };

  try {
    const [first, concurrent] = await Promise.all([
      fetchMediaIndexEpisodes(424242),
      fetchMediaIndexEpisodes(424242),
    ]);
    assert.deepEqual(first, []);
    assert.deepEqual(concurrent, []);
    assert.equal(legacyCalls, 1);
    assert.equal((await fetchMediaIndexEpisodes(424242))[0]?.number, 1);
    assert.equal(legacyCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dub availability stays unknown on index failure and retries later', async () => {
  const originalFetch = globalThis.fetch;
  let legacyCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes('/data/dub-index.json')) {
      legacyCalls += 1;
      return legacyCalls === 1
        ? new Response('', { status: 503 })
        : new Response(JSON.stringify([207191]), { status: 200 });
    }
    return new Response('', { status: 503 });
  };

  try {
    assert.equal(await isAnimeDubbed(207191), null);
    assert.equal(await isAnimeDubbed(207191), true);
    assert.equal(await isAnimeDubbed(1), false);
    assert.equal(legacyCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
