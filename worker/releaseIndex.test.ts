import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStableReleaseIndex,
  publishStableReleaseIndex,
  type ReleaseIndexBucket,
  type ReleaseIndexStoredObject,
} from './releaseIndex';

const SECRET = 'release-index-test-secret';
const NOW = 1_800_000_000;
const FILENAMES = [
  ['mobile-universal', 'mobile', 'universal', true, 'Anilife.apk'],
  ['mobile-arm64', 'mobile', 'arm64-v8a', false, 'Anilife_arm64-v8a.apk'],
  ['mobile-armv7', 'mobile', 'armeabi-v7a', false, 'Anilife_armeabi-v7a.apk'],
  ['tv-universal', 'tv', 'universal', true, 'Anilife_tv.apk'],
  ['tv-arm64', 'tv', 'arm64-v8a', false, 'Anilife_tv_arm64-v8a.apk'],
  ['tv-armv7', 'tv', 'armeabi-v7a', false, 'Anilife_tv_armeabi-v7a.apk'],
] as const;

function releaseIndex(sequence = 5) {
  const version = sequence === 5 ? '0.1.2' : '0.1.1';
  const tag = `v${version}`;
  return {
    schema: 1,
    channel: 'stable',
    version,
    versionCode: sequence,
    sequence,
    tag,
    publishedAt: '2026-11-14T18:24:23Z',
    releaseUrl: `https://github.com/anilifecommunity/android-and-tv/releases/tag/${tag}`,
    updateEvent: { id: '1'.repeat(64), pubkey: '2'.repeat(64), sig: '3'.repeat(128) },
    assets: FILENAMES.map(([id, formFactor, abi, recommended, name]) => ({
      id,
      formFactor,
      abi,
      recommended,
      name,
      url: `https://github.com/anilifecommunity/android-and-tv/releases/download/${tag}/${name}`,
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    })),
  };
}

function body(value = releaseIndex()): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

async function signature(timestamp: number, bytes: Uint8Array): Promise<string> {
  const prefix = new TextEncoder().encode(`${timestamp}\n`);
  const message = new Uint8Array(prefix.length + bytes.length);
  message.set(prefix);
  message.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  return `v1=${[...signed].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

class FakeBucket {
  bytes: Uint8Array | null = null;
  etag = 'etag-0';
  metadata: Record<string, string> = {};
  failWrite = false;

  async get(): Promise<ReleaseIndexStoredObject | null> {
    if (!this.bytes) return null;
    const bytes = this.bytes.slice();
    return {
      etag: this.etag,
      customMetadata: { ...this.metadata },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }

  async put(
    _key: string,
    value: ArrayBuffer,
    options: {
      onlyIf: { etagMatches: string } | { etagDoesNotMatch: string };
      customMetadata: Record<string, string>;
    }
  ): Promise<{ etag: string } | null> {
    if (this.failWrite) throw new Error('write failed');
    if (this.bytes && !('etagMatches' in options.onlyIf && options.onlyIf.etagMatches === this.etag)) return null;
    if (!this.bytes && !('etagDoesNotMatch' in options.onlyIf && options.onlyIf.etagDoesNotMatch === '*')) return null;
    this.bytes = new Uint8Array(value.slice(0));
    this.etag = `etag-${Number(this.etag.slice(5)) + 1}`;
    this.metadata = { ...(options.customMetadata ?? {}) };
    return { etag: this.etag };
  }
}

class FakeCache {
  deletes: string[] = [];
  fail = false;

  async delete(request: RequestInfo): Promise<boolean> {
    if (this.fail) throw new Error('cache failed');
    this.deletes.push(String(request instanceof Request ? request.url : request));
    return true;
  }
}

async function publish(
  bucket: FakeBucket,
  cache: FakeCache,
  bytes = body(),
  timestamp = NOW,
  signatureOverride?: string
): Promise<Response> {
  const request = new Request('https://anilife.cc/internal/releases/stable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Anilife-Timestamp': String(timestamp),
      'X-Anilife-Signature': signatureOverride ?? (await signature(timestamp, bytes)),
    },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
  return publishStableReleaseIndex(
    request,
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, WEB_RELEASE_INDEX_HMAC_KEY: SECRET },
    cache,
    NOW
  );
}

test('publishes a valid index and invalidates the public cache', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  const response = await publish(bucket, cache);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, stored: true, idempotent: false });
  assert.deepEqual(cache.deletes, ['https://anilife.cc/downloads/index.json']);
  assert.equal(bucket.metadata.sequence, '5');
});

test('rejects bad HMAC and expired or future timestamps', async () => {
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW, `v1=${'0'.repeat(64)}`)).status, 401);
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW - 301)).status, 401);
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW + 301)).status, 401);
});

test('accepts an exact replay idempotently', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  assert.equal((await publish(bucket, cache)).status, 200);
  const replay = await publish(bucket, cache);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, stored: false, idempotent: true });
});

test('rejects downgrade and same-sequence conflicts', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  assert.equal((await publish(bucket, cache)).status, 200);
  assert.equal((await publish(bucket, cache, body(releaseIndex(4)))).status, 409);

  const conflict = releaseIndex();
  conflict.publishedAt = '2026-11-14T18:25:23Z';
  assert.equal((await publish(bucket, cache, body(conflict))).status, 409);
});

test('rejects malformed schema, missing or extra assets, and wrong URLs', async () => {
  const malformed = { ...releaseIndex(), schema: 2 };
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(malformed))).status, 400);

  const missing = releaseIndex();
  missing.assets.pop();
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(missing))).status, 400);

  const extra = releaseIndex();
  (extra.assets as Array<Record<string, unknown>>).push({
    ...extra.assets[0],
    id: 'extra',
    name: 'extra.apk',
  });
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(extra))).status, 400);

  const wrongUrl = releaseIndex();
  wrongUrl.assets[0].url = 'https://example.invalid/Anilife.apk';
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(wrongUrl))).status, 400);
});

test('reports R2 write and cache invalidation failures without echoing the payload', async () => {
  const bucket = new FakeBucket();
  bucket.failWrite = true;
  const writeResponse = await publish(bucket, new FakeCache());
  assert.equal(writeResponse.status, 503);
  assert.doesNotMatch(await writeResponse.text(), /Anilife\.apk/);

  const cache = new FakeCache();
  cache.fail = true;
  const cacheResponse = await publish(new FakeBucket(), cache);
  assert.equal(cacheResponse.status, 503);
});

test('serves byte-identical JSON with the body SHA-256 ETag and ignores query parameters', async () => {
  const bucket = new FakeBucket();
  const expected = body();
  assert.equal((await publish(bucket, new FakeCache(), expected)).status, 200);

  const response = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json?verify=1800000000'),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, WEB_RELEASE_INDEX_HMAC_KEY: SECRET }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected);
  assert.match(response.headers.get('etag') ?? '', /^"[0-9a-f]{64}"$/);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=30, s-maxage=86400');
});
