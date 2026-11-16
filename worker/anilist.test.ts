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

test('Anilife media index proves aired episodes when AniList rejects Worker egress', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    assert.equal(
      url.href,
      'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/data/anime/209/209219/episodes.json'
    );
    return new Response(JSON.stringify([
      { number: 1, airDate: '2000-01-01' },
      { number: 2, air_date: '2000-01-08' },
      { number: 3, airDate: '2999-01-01' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  resetAniListCache();
  try {
    assert.equal(await isAniListEpisodeAvailable(209219, 2, 1000), true);
    assert.equal(await isAniListEpisodeAvailable(209219, 3, 1000), false);
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});
