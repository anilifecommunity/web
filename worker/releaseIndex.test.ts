import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStableReleaseIndex,
  publishStableReleaseIndex,
  type ReleaseIndexBucket,
  type ReleaseIndexStoredObject,
  type ReleaseIndexUsageDatabase,
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
  reads = 0;

  async get(): Promise<ReleaseIndexStoredObject | null> {
    this.reads += 1;
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

class FakeUsageDatabase implements ReleaseIndexUsageDatabase {
  classA = 0;
  classB = 0;
  unavailable = false;
  limited: 'class_a' | 'class_b' | null = null;
  limits: number[] = [];

  prepare(query: string) {
    const operation = query.includes('(day, class_a)') ? 'class_a' : 'class_b';
    return {
      bind: (...values: Array<string | number>) => ({
        first: async <T>() => {
          if (this.unavailable) throw new Error('usage unavailable');
          this.limits.push(Number(values[2]));
          if (this.limited === operation) return null;
          if (operation === 'class_a') this.classA += 1;
          else this.classB += 1;
          return { count: operation === 'class_a' ? this.classA : this.classB } as T;
        },
      }),
    };
  }
}

class FakeCache {
  deletes: string[] = [];
  responses = new Map<string, Response>();
  fail = false;

  async match(request: RequestInfo): Promise<Response | undefined> {
    if (this.fail) throw new Error('cache failed');
    return this.responses.get(String(request instanceof Request ? request.url : request))?.clone();
  }

  async put(request: RequestInfo, response: Response): Promise<void> {
    if (this.fail) throw new Error('cache failed');
    this.responses.set(String(request instanceof Request ? request.url : request), response.clone());
  }

  async delete(request: RequestInfo): Promise<boolean> {
    if (this.fail) throw new Error('cache failed');
    const key = String(request instanceof Request ? request.url : request);
    this.deletes.push(key);
    this.responses.delete(key);
    return true;
  }
}

async function publish(
  bucket: FakeBucket,
  cache: FakeCache,
  bytes = body(),
  timestamp = NOW,
  signatureOverride?: string,
  usage = new FakeUsageDatabase()
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
    {
      RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket,
      RELEASE_INDEX_USAGE: usage,
      WEB_RELEASE_INDEX_HMAC_KEY: SECRET,
    },
    cache,
    NOW
  );
}

test('publishes a valid index and invalidates the public cache', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  const usage = new FakeUsageDatabase();
  const response = await publish(bucket, cache, body(), NOW, undefined, usage);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, stored: true, idempotent: false });
  assert.deepEqual(cache.deletes, ['https://anilife.cc/downloads/index.json']);
  assert.equal(bucket.metadata.sequence, '5');
  assert.deepEqual([usage.classA, usage.classB], [1, 1]);
  assert.deepEqual(usage.limits, [7_500_000, 750_000]);
});

test('rejects bad HMAC and expired or future timestamps', async () => {
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW, `v1=${'0'.repeat(64)}`)).status, 401);
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW - 301)).status, 401);
  assert.equal((await publish(new FakeBucket(), new FakeCache(), body(), NOW + 301)).status, 401);
});

test('accepts an exact replay idempotently', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  const usage = new FakeUsageDatabase();
  assert.equal((await publish(bucket, cache, body(), NOW, undefined, usage)).status, 200);
  const replay = await publish(bucket, cache, body(), NOW, undefined, usage);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, stored: false, idempotent: true });
  assert.deepEqual([usage.classA, usage.classB], [1, 2]);
});

test('hard-stops before R2 when the usage cap is reached or accounting is unavailable', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  const usage = new FakeUsageDatabase();
  usage.limited = 'class_b';
  const readResponse = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json'),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, RELEASE_INDEX_USAGE: usage },
    NOW,
    cache
  );
  assert.equal(readResponse.status, 503);
  assert.equal(bucket.reads, 0);

  usage.limited = 'class_a';
  const writeResponse = await publish(bucket, new FakeCache(), body(), NOW, undefined, usage);
  assert.equal(writeResponse.status, 503);
  assert.equal(bucket.bytes, null);

  usage.limited = null;
  usage.unavailable = true;
  const unavailable = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json'),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, RELEASE_INDEX_USAGE: usage },
    NOW,
    cache
  );
  assert.equal(unavailable.status, 503);
  assert.equal(bucket.reads, 1);
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

test('serves the published index when the local read cache is unavailable', async () => {
  const bucket = new FakeBucket();
  const usage = new FakeUsageDatabase();
  assert.equal((await publish(bucket, new FakeCache(), body(), NOW, undefined, usage)).status, 200);
  const cache = new FakeCache();
  cache.fail = true;

  const response = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json'),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, RELEASE_INDEX_USAGE: usage },
    NOW,
    cache
  );

  assert.equal(response.status, 200);
  assert.equal(usage.classB, 2);
  assert.equal(bucket.reads, 2);
});

test('serves byte-identical JSON with the body SHA-256 ETag and ignores query parameters', async () => {
  const bucket = new FakeBucket();
  const cache = new FakeCache();
  const usage = new FakeUsageDatabase();
  const expected = body();
  assert.equal((await publish(bucket, new FakeCache(), expected, NOW, undefined, usage)).status, 200);

  const response = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json?verify=1800000000'),
    {
      RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket,
      RELEASE_INDEX_USAGE: usage,
      WEB_RELEASE_INDEX_HMAC_KEY: SECRET,
    },
    NOW,
    cache
  );
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected);
  assert.match(response.headers.get('etag') ?? '', /^"[0-9a-f]{64}"$/);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=30, s-maxage=300');

  const reads = bucket.reads;
  const classB = usage.classB;
  const cached = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json?second=1'),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, RELEASE_INDEX_USAGE: usage },
    NOW,
    cache
  );
  assert.deepEqual(new Uint8Array(await cached.arrayBuffer()), expected);
  assert.equal(bucket.reads, reads);
  assert.equal(usage.classB, classB);

  const notModified = await getStableReleaseIndex(
    new Request('https://anilife.cc/downloads/index.json', {
      headers: { 'If-None-Match': response.headers.get('etag') ?? '' },
    }),
    { RELEASE_INDEX_BUCKET: bucket as ReleaseIndexBucket, RELEASE_INDEX_USAGE: usage },
    NOW,
    cache
  );
  assert.equal(notModified.status, 304);
  assert.equal(bucket.reads, reads);
  assert.equal(usage.classB, classB);
});
