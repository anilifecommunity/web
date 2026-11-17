import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMediaIndexClient,
  mediaIndexSearchBucket,
  mediaIndexVisibilityAllowed,
  MediaIndexError,
  normalizeMediaIndexSearch,
  validateMediaIndexPointer,
  type MediaIndexCache,
  type MediaIndexFileDescriptor,
  type MediaIndexPointer,
  type MediaIndexReleaseManifest,
} from './mediaIndexRelease';

const RELEASE_A = 'rel-0123456789abcdef';
const RELEASE_B = 'rel-fedcba9876543210';
const CONTENT_HASH = `sha256:${'a'.repeat(64)}`;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function descriptor(path: string, text: string): Promise<MediaIndexFileDescriptor> {
  return { path, bytes: new TextEncoder().encode(text).byteLength, sha256: await sha256(text) };
}

class MemoryCache implements MediaIndexCache {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}

function jsonResponse(text: string, status = 200, contentType = 'application/json'): Response {
  return new Response(text, {
    status,
    headers: {
      'content-type': contentType,
      'content-length': String(new TextEncoder().encode(text).byteLength),
    },
  });
}

async function fixture(releaseId = RELEASE_A) {
  const home = JSON.stringify({
    schemaVersion: '1.1.0',
    generatedAt: '2026-11-17T12:00:00Z',
    rows: {
      spotlight: [],
      trending: [],
      popular: [],
      topRated: [],
      season: [],
      newest: [],
      upcoming: [],
      movies: [],
    },
  });
  const browse = JSON.stringify({ schemaVersion: '1.1.0', generatedAt: '2026-11-17T12:00:00Z', rows: [] });
  const schedule = JSON.stringify([{
    id: 21,
    episode: 4,
    airingAt: 1794945600,
    english: 'Verified title',
    romaji: 'Kakunin-zumi',
    cover: 'https://s4.anilist.co/example.jpg',
    format: 'TV',
    year: 2026,
    adult: false,
  }]);
  const homeFile = await descriptor('catalog/home.json', home);
  const browseFile = await descriptor('catalog/browse.json', browse);
  const scheduleFile = await descriptor('schedule/2026-11.json', schedule);
  const manifest: MediaIndexReleaseManifest = {
    schemaVersion: '1.1.0',
    contract: 'anilife.media',
    releaseId,
    generatedAt: '2026-11-17T12:00:00Z',
    contentHash: CONTENT_HASH,
    counts: { media: 0, episodeLists: 0, episodes: 0, relations: 0, adult: 0, auxFiles: 0 },
    sources: [{ name: 'anilist', status: 'verified', permitted: true }],
    catalog: { files: [] },
    home: homeFile,
    browse: browseFile,
    search: { files: [] },
    identity: { ledger: await descriptor('identity/ledger.json', '{}') },
    ids: { files: [] },
    aux: { files: [scheduleFile] },
    manifests: { media: { files: [] }, episodes: { files: [] } },
  };
  const manifestText = JSON.stringify(manifest);
  const pointer: MediaIndexPointer = {
    schemaVersion: '1.1.0',
    contract: 'anilife.media',
    releaseId,
    releaseManifest: `releases/${releaseId}/manifest.json`,
    contentHash: CONTENT_HASH,
    manifestSha256: await sha256(manifestText),
    generatedAt: '2026-11-17T12:00:00Z',
    publishedAt: '2026-11-17T12:01:00Z',
    counts: manifest.counts,
  };
  return { home, browse, schedule, manifestText, pointerText: JSON.stringify(pointer), pointer };
}

test('pins and verifies one immutable release before returning home data', async () => {
  const data = await fixture();
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) return jsonResponse(data.pointerText);
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(data.manifestText);
    if (url.endsWith(`/releases/${RELEASE_A}/catalog/home.json`)) return jsonResponse(data.home);
    return jsonResponse('{}', 404);
  };

  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache: new MemoryCache(), sessionTtlMs: 0 });
  const result = await client.home();

  assert.equal(result.releaseId, RELEASE_A);
  assert.equal(result.state, 'INDEX');
  assert.deepEqual(result.data.rows.spotlight, []);
  assert.deepEqual(requested, [
    'https://example.test/manifest.json',
    `https://example.test/releases/${RELEASE_A}/manifest.json`,
    `https://example.test/releases/${RELEASE_A}/catalog/home.json`,
  ]);
});

test('uses the last verified record after a transient failure without replacing it with empty data', async () => {
  const data = await fixture();
  const cache = new MemoryCache();
  let homeUnavailable = false;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) return jsonResponse(data.pointerText);
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(data.manifestText);
    if (url.endsWith(`/releases/${RELEASE_A}/catalog/home.json`)) {
      return homeUnavailable ? jsonResponse('{}', 503) : jsonResponse(data.home);
    }
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache, sessionTtlMs: 0 });

  assert.equal((await client.home()).state, 'INDEX');
  homeUnavailable = true;
  const fallback = await client.home();
  assert.equal(fallback.state, 'LOCAL');
  assert.equal(fallback.failure, 'unavailable');
  assert.equal(fallback.releaseId, RELEASE_A);
});

test('rejects a tampered record before display', async () => {
  const data = await fixture();
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) return jsonResponse(data.pointerText);
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(data.manifestText);
    if (url.endsWith(`/releases/${RELEASE_A}/catalog/home.json`)) {
      return jsonResponse(data.home.replace('2026-11-17T12:00:00Z', '2026-11-17T12:00:01Z'));
    }
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache: new MemoryCache(), sessionTtlMs: 0 });

  await assert.rejects(
    client.home(),
    (error: unknown) => error instanceof MediaIndexError && error.code === 'integrity',
  );
});

test('rejects JSON responses that omit a content type', async () => {
  const data = await fixture();
  const fetcher: typeof fetch = async () => new Response(data.pointerText, { status: 200 });
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache: new MemoryCache() });

  await assert.rejects(
    client.home(),
    (error: unknown) => error instanceof MediaIndexError && error.code === 'invalid_content_type',
  );
});

test('a pointer to a missing release keeps the prior release and never mixes release paths', async () => {
  const first = await fixture(RELEASE_A);
  const second = await fixture(RELEASE_B);
  const cache = new MemoryCache();
  let nextPointer = false;
  let releaseAHomeUnavailable = false;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) {
      return jsonResponse(nextPointer ? second.pointerText : first.pointerText);
    }
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(first.manifestText);
    if (url.endsWith(`/releases/${RELEASE_B}/manifest.json`)) return jsonResponse('{}', 404);
    if (url.endsWith(`/releases/${RELEASE_A}/catalog/home.json`)) {
      return releaseAHomeUnavailable ? jsonResponse('{}', 503) : jsonResponse(first.home);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache, sessionTtlMs: 0 });

  await client.home();
  nextPointer = true;
  releaseAHomeUnavailable = true;
  const fallback = await client.home();
  assert.equal(fallback.releaseId, RELEASE_A);
  assert.equal(fallback.state, 'LOCAL');
});

test('a stale CDN pointer never rolls a browser back from a newer verified release', async () => {
  const current = await fixture(RELEASE_A);
  const stale = await fixture(RELEASE_B);
  const currentPointer = { ...current.pointer, publishedAt: '2026-11-17T12:05:00Z' };
  const stalePointer = { ...stale.pointer, publishedAt: '2026-11-17T11:55:00Z' };
  const cache = new MemoryCache();
  let serveStale = false;
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) {
      return jsonResponse(JSON.stringify(serveStale ? stalePointer : currentPointer));
    }
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(current.manifestText);
    if (url.endsWith(`/releases/${RELEASE_A}/catalog/home.json`)) return jsonResponse(current.home);
    if (url.endsWith(`/releases/${RELEASE_B}/manifest.json`)) throw new Error('stale release must not be loaded');
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache, sessionTtlMs: 0 });

  await client.home();
  serveStale = true;
  const fallback = await client.home();
  assert.equal(fallback.releaseId, RELEASE_A);
  assert.equal(fallback.state, 'LOCAL');
  assert.equal(requested.some((url) => url.includes(`/releases/${RELEASE_B}/`)), false);
});

test('fixed GitHub Raw fallback bypasses jsDelivr package-size denial without weakening integrity', async () => {
  const stale = await fixture(RELEASE_A);
  const current = await fixture(RELEASE_B);
  const stalePointer = { ...stale.pointer, publishedAt: '2026-11-17T11:55:00Z' };
  const currentPointer = { ...current.pointer, publishedAt: '2026-11-17T12:05:00Z' };
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const raw = url.hostname === 'raw.githubusercontent.com';
    if (url.pathname.endsWith('/manifest.json') && !url.pathname.includes('/releases/')) {
      return jsonResponse(JSON.stringify(raw ? currentPointer : stalePointer), 200, raw ? 'text/plain' : 'application/json');
    }
    if (url.pathname.endsWith(`/releases/${RELEASE_B}/manifest.json`)) {
      return raw
        ? jsonResponse(current.manifestText, 200, 'text/plain')
        : jsonResponse('Package size exceeded', 403, 'text/plain');
    }
    if (url.pathname.endsWith(`/releases/${RELEASE_B}/catalog/home.json`)) {
      return raw
        ? jsonResponse(current.home, 200, 'text/plain')
        : jsonResponse('Package size exceeded', 403, 'text/plain');
    }
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ fetch: fetcher, cache: new MemoryCache(), sessionTtlMs: 0 });

  const result = await client.home();
  assert.equal(result.releaseId, RELEASE_B);
  assert.equal(result.state, 'INDEX');
});

test('an unapproved source blocks promotion', async () => {
  const data = await fixture();
  const manifest = JSON.parse(data.manifestText) as MediaIndexReleaseManifest;
  manifest.sources[0] = { name: 'anilist', status: 'unverified', permitted: false };
  const manifestText = JSON.stringify(manifest);
  const pointer = { ...data.pointer, manifestSha256: await sha256(manifestText) };
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) return jsonResponse(JSON.stringify(pointer));
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(manifestText);
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache: new MemoryCache(), sessionTtlMs: 0 });

  await assert.rejects(
    client.home(),
    (error: unknown) => error instanceof MediaIndexError && error.code === 'rights_blocked',
  );
});

test('validates and returns a verified schedule month', async () => {
  const data = await fixture();
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/manifest.json') && !url.includes('/releases/')) return jsonResponse(data.pointerText);
    if (url.endsWith(`/releases/${RELEASE_A}/manifest.json`)) return jsonResponse(data.manifestText);
    if (url.endsWith(`/releases/${RELEASE_A}/schedule/2026-11.json`)) return jsonResponse(data.schedule);
    return jsonResponse('{}', 404);
  };
  const client = createMediaIndexClient({ baseUrl: 'https://example.test', fetch: fetcher, cache: new MemoryCache() });

  const result = await client.schedule(2026, 11);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].episode, 4);
  assert.equal(result.data[0].adult, false);
});

test('rejects unsupported contract versions explicitly', () => {
  assert.throws(
    () => validateMediaIndexPointer({ schemaVersion: '2.0.0' }),
    (error: unknown) => error instanceof MediaIndexError && error.code === 'unsupported_schema',
  );
});

test('normalizes multilingual search and conservatively filters unknown adult visibility', async () => {
  assert.equal(normalizeMediaIndexSearch('  Shingeki  no   Kyōjin '), 'shingeki no kyojin');
  assert.equal(await mediaIndexSearchBucket('進撃の巨人'), await mediaIndexSearchBucket('進撃の巨人'));
  assert.equal(mediaIndexVisibilityAllowed('general', true), true);
  assert.equal(mediaIndexVisibilityAllowed('adult', true), false);
  assert.equal(mediaIndexVisibilityAllowed('unknown-conservative', true), false);
  assert.equal(mediaIndexVisibilityAllowed('unknown-conservative', false), true);
});
