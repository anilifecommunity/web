import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAniListEpisodeAvailability,
  isAniListEpisodeAvailable,
  resetAniListCache,
} from './anilist';

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

test('large long-running episode indexes remain bounded but fit below one MiB', async () => {
  const originalFetch = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    visited.push(url.hostname);
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    assert.equal(url.hostname, 'cdn.jsdelivr.net');
    return new Response(JSON.stringify([
      { number: 1, air_date: '1999-10-20' },
      { number: 1_100, air_date: '2999-01-01' },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Length': '559000' },
    });
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(21, 1, 1000), 'available');
    assert.equal(visited[0], 'graphql.anilist.co');
    assert.equal(visited.some((host) => host === 'raw.githubusercontent.com'), true);
    assert.ok(visited.length <= 6, `expected bounded fallback fanout, got ${visited.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});

test('episode indexes above one MiB fail closed and continue to the metadata fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    if (url.hostname === 'cdn.jsdelivr.net') {
      return new Response('[]', { status: 200, headers: { 'Content-Length': String(1024 * 1024 + 1) } });
    }
    assert.equal(url.hostname, 'api.ani.zip');
    return new Response(JSON.stringify({ mappings: { mal_id: null } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(99, 1, 1000), 'unknown');
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});

test('a released title missing from the media index uses mapped catalogue metadata', async () => {
  const originalFetch = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    visited.push(url.hostname);
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    if (url.hostname === 'cdn.jsdelivr.net') return new Response('missing', { status: 404 });
    if (url.hostname === 'api.ani.zip') {
      return new Response(JSON.stringify({ mappings: { mal_id: 59119 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url.href, 'https://shikimori.one/api/animes/59119');
    return new Response(JSON.stringify({
      status: 'released',
      episodes: 6,
      episodes_aired: 4,
      aired_on: '2024-08-30',
      released_on: '2025-05-30',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(177789, 1, 1000), 'available');
    assert.equal(await getAniListEpisodeAvailability(177789, 6, 1000), 'available');
    assert.equal(await getAniListEpisodeAvailability(177789, 7, 1000), 'unavailable');
    assert.equal(visited.filter((host) => host === 'graphql.anilist.co').length, 3);
    assert.equal(visited.filter((host) => host === 'api.ani.zip').length, 3);
    assert.equal(visited.filter((host) => host === 'shikimori.one').length, 3);
    assert.ok(visited.length <= 27, `expected bounded per-episode fallback fanout, got ${visited.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});

test('future mapped titles remain unavailable rather than becoming unknown', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    if (url.hostname === 'cdn.jsdelivr.net') return new Response('missing', { status: 404 });
    if (url.hostname === 'api.ani.zip') {
      return new Response(JSON.stringify({ mappings: { mal_id: 123 } }), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: 'anons',
      episodes: 12,
      episodes_aired: 0,
      aired_on: '2999-01-01',
    }), { status: 200 });
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(123, 1, 1000), 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});

test('finished movie metadata proves only its declared episode range', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    if (url.pathname.endsWith('/manifest.json')) return new Response('missing', { status: 404 });
    if (url.pathname.endsWith('/data/anime/171/171627/episodes.json')) return new Response('missing', { status: 404 });
    if (url.pathname.endsWith('/data/anime/171/171627/index.json')) {
      return new Response(JSON.stringify({
        ids: { anilist: 171627, mal: 57555 },
        format: 'MOVIE',
        status: 'FINISHED',
        episodes: 1,
        startDate: { year: 2025, month: 9, day: 19 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected upstream: ${url}`);
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(171627, 1, 1000), 'available');
    assert.equal(await getAniListEpisodeAvailability(171627, 2, 1000), 'unavailable');
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});

test('a sparse dated episode index never proves a missing episode', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'graphql.anilist.co') return new Response('forbidden', { status: 403 });
    if (url.pathname.endsWith('/manifest.json')) return new Response('missing', { status: 404 });
    if (url.pathname.endsWith('/data/anime/999/999111/episodes.json')) {
      return new Response(JSON.stringify([
        { number: 1, airDate: '2020-01-01' },
        { number: 4, airDate: '2020-01-04' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname.endsWith('/data/anime/999/999111/index.json')) return new Response('missing', { status: 404 });
    if (url.hostname === 'api.ani.zip') {
      return new Response(JSON.stringify({ mappings: { mal_id: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected upstream: ${url}`);
  };
  resetAniListCache();
  try {
    assert.equal(await getAniListEpisodeAvailability(999111, 3, 1000), 'unknown');
    assert.equal(await getAniListEpisodeAvailability(999111, 4, 1000), 'available');
  } finally {
    globalThis.fetch = originalFetch;
    resetAniListCache();
  }
});
