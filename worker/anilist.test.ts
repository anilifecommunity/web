import assert from 'node:assert/strict';
import test from 'node:test';
import { isAniListEpisodeAvailable, resetAniListCache } from './anilist';

async function withMedia(
  media: { status: string; episodes: number | null; nextAiringEpisode: { episode: number; airingAt: number } | null },
  check: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { Media: media } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  resetAniListCache();
  try {
    await check();
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
}

test('finished anime allow only confirmed episode numbers', async () => {
  await withMedia({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, async () => {
    assert.equal(await isAniListEpisodeAvailable(1, 12, 1000), true);
    assert.equal(await isAniListEpisodeAvailable(1, 13, 1000), false);
  });
});

test('releasing anime stop before the next unaired episode', async () => {
  await withMedia({ status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 5, airingAt: 2_000 } }, async () => {
    assert.equal(await isAniListEpisodeAvailable(2, 4, 1000), true);
    assert.equal(await isAniListEpisodeAvailable(2, 5, 1000), false);
  });
});

test('not-yet-released anime cannot mint a watch session', async () => {
  await withMedia({ status: 'NOT_YET_RELEASED', episodes: 12, nextAiringEpisode: { episode: 1, airingAt: 2_000 } }, async () => {
    assert.equal(await isAniListEpisodeAvailable(3, 1, 1000), false);
  });
});
