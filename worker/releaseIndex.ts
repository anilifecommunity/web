import { fail, json } from './http';
import { RequestBodyError, readRequestBytesCapped } from './guards';

const INDEX_KEY = 'releases/stable.json';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_CLASS_A_PER_31_DAYS = 740_000;
const MAX_CLASS_B_PER_31_DAYS = 7_500_000;
// shortcut: publisher invalidation is PoP-local; add cache-tag purge if release propagation must be immediate.
const PUBLIC_CACHE_CONTROL = 'public, max-age=30, s-maxage=300';
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

const EXPECTED_ASSETS = [
  ['mobile-universal', 'mobile', 'universal', true, 'Anilife.apk'],
  ['mobile-arm64', 'mobile', 'arm64-v8a', false, 'Anilife_arm64-v8a.apk'],
  ['mobile-armv7', 'mobile', 'armeabi-v7a', false, 'Anilife_armeabi-v7a.apk'],
  ['tv-universal', 'tv', 'universal', true, 'Anilife_tv.apk'],
  ['tv-arm64', 'tv', 'arm64-v8a', false, 'Anilife_tv_arm64-v8a.apk'],
  ['tv-armv7', 'tv', 'armeabi-v7a', false, 'Anilife_tv_armeabi-v7a.apk'],
] as const;

export interface StableReleaseIndex {
  schema: 1;
  channel: 'stable';
  version: string;
  versionCode: number;
  sequence: number;
  tag: string;
  publishedAt: string;
  releaseUrl: string;
  updateEvent: { id: string; pubkey: string; sig: string };
  assets: Array<{
    id: string;
    formFactor: 'mobile' | 'tv';
    abi: 'universal' | 'arm64-v8a' | 'armeabi-v7a';
    recommended: boolean;
    name: string;
    url: string;
    sha256: string;
    sizeBytes: number;
  }>;
}

export interface ReleaseIndexEnv {
  RELEASE_INDEX_BUCKET: ReleaseIndexBucket;
  RELEASE_INDEX_USAGE: ReleaseIndexUsageDatabase;
  WEB_RELEASE_INDEX_HMAC_KEY?: string;
}

export interface ReleaseIndexUsageDatabase {
  prepare(query: string): {
    bind(...values: Array<string | number>): {
      first<T>(): Promise<T | null>;
    };
  };
}

export interface ReleaseIndexStoredObject {
  etag: string;
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ReleaseIndexBucket {
  get(key: string): Promise<ReleaseIndexStoredObject | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      onlyIf: { etagMatches: string } | { etagDoesNotMatch: string };
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    }
  ): Promise<{ etag: string } | null>;
}

export interface ReleaseIndexCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

class InvalidReleaseIndex extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidReleaseIndex();
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseStableReleaseIndex(value: unknown): StableReleaseIndex {
  const index = object(value);
  if (index.schema !== 1 || index.channel !== 'stable') throw new InvalidReleaseIndex();
  if (typeof index.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(index.version)) {
    throw new InvalidReleaseIndex();
  }
  if (!positiveInteger(index.versionCode) || !positiveInteger(index.sequence)) {
    throw new InvalidReleaseIndex();
  }
  if (index.sequence < index.versionCode || index.tag !== `v${index.version}`) {
    throw new InvalidReleaseIndex();
  }
  if (typeof index.publishedAt !== 'string' || !Number.isFinite(Date.parse(index.publishedAt))) {
    throw new InvalidReleaseIndex();
  }
  const releasePrefix = 'https://github.com/anilifecommunity/android-and-tv/releases';
  if (index.releaseUrl !== `${releasePrefix}/tag/${index.tag}`) throw new InvalidReleaseIndex();

  const event = object(index.updateEvent);
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    !HEX_64.test(event.id) ||
    !HEX_64.test(event.pubkey) ||
    !HEX_128.test(event.sig)
  ) {
    throw new InvalidReleaseIndex();
  }

  if (!Array.isArray(index.assets) || index.assets.length !== EXPECTED_ASSETS.length) {
    throw new InvalidReleaseIndex();
  }
  const byName = new Map<string, Record<string, unknown>>();
  for (const raw of index.assets) {
    const asset = object(raw);
    if (typeof asset.name !== 'string' || byName.has(asset.name)) throw new InvalidReleaseIndex();
    byName.set(asset.name, asset);
  }

  for (const [id, formFactor, abi, recommended, name] of EXPECTED_ASSETS) {
    const asset = byName.get(name);
    const expectedUrl = `${releasePrefix}/download/${index.tag}/${name}`;
    if (
      !asset ||
      asset.id !== id ||
      asset.formFactor !== formFactor ||
      asset.abi !== abi ||
      asset.recommended !== recommended ||
      asset.url !== expectedUrl ||
      typeof asset.sha256 !== 'string' ||
      !HEX_64.test(asset.sha256) ||
      !positiveInteger(asset.sizeBytes)
    ) {
      throw new InvalidReleaseIndex();
    }
  }

  return index as unknown as StableReleaseIndex;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function decodeHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function validSignature(
  secret: string,
  timestamp: string,
  body: ArrayBuffer,
  provided: string
): Promise<boolean> {
  const match = /^v1=([0-9a-f]{64})$/.exec(provided);
  if (!match) return false;
  const prefix = new TextEncoder().encode(`${timestamp}\n`);
  const message = new Uint8Array(prefix.length + body.byteLength);
  message.set(prefix);
  message.set(new Uint8Array(body), prefix.length);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  return equalBytes(expected, decodeHex(match[1]));
}

async function readStoredIndex(bucket: ReleaseIndexBucket): Promise<{
  object: ReleaseIndexStoredObject;
  body: ArrayBuffer;
  index: StableReleaseIndex;
  hash: string;
} | null> {
  const stored = await bucket.get(INDEX_KEY);
  if (!stored) return null;
  const body = await stored.arrayBuffer();
  const index = parseStableReleaseIndex(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)));
  return {
    object: stored,
    body,
    index,
    hash: stored.customMetadata?.sha256 ?? (await sha256(body)),
  };
}

async function consumeR2Operation(
  database: ReleaseIndexUsageDatabase,
  operation: 'class_a' | 'class_b',
  nowSeconds: number
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const now = new Date(nowSeconds * 1000);
  const day = now.toISOString().slice(0, 10);
  now.setUTCDate(now.getUTCDate() - 30);
  const cutoff = now.toISOString().slice(0, 10);
  const limit = operation === 'class_a' ? MAX_CLASS_A_PER_31_DAYS : MAX_CLASS_B_PER_31_DAYS;
  try {
    const row = await database
      .prepare(
        `INSERT INTO release_index_usage (day, ${operation})
         SELECT ?1, 1
         WHERE (SELECT COALESCE(SUM(${operation}), 0) FROM release_index_usage WHERE day >= ?2) < ?3
         ON CONFLICT(day) DO UPDATE SET ${operation} = ${operation} + 1
         WHERE (SELECT COALESCE(SUM(${operation}), 0) FROM release_index_usage WHERE day >= ?2) < ?3
         RETURNING ${operation} AS count`
      )
      .bind(day, cutoff, limit)
      .first<{ count: number }>();
    return row ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}

async function requireR2Operation(
  env: ReleaseIndexEnv,
  operation: 'class_a' | 'class_b',
  nowSeconds: number
): Promise<Response | null> {
  if (!env.RELEASE_INDEX_USAGE) return fail(503, 'release_index_usage_not_configured');
  const result = await consumeR2Operation(env.RELEASE_INDEX_USAGE, operation, nowSeconds);
  if (result === 'limited') return fail(503, 'release_index_usage_limit');
  if (result === 'unavailable') return fail(503, 'release_index_usage_unavailable');
  return null;
}

export async function publishStableReleaseIndex(
  request: Request,
  env: ReleaseIndexEnv,
  cache: ReleaseIndexCache = (caches as CacheStorage & { default: ReleaseIndexCache }).default,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<Response> {
  if (!env.WEB_RELEASE_INDEX_HMAC_KEY || !env.RELEASE_INDEX_BUCKET) {
    return fail(503, 'release_index_not_configured');
  }
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    return fail(415, 'unsupported_media_type');
  }
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > MAX_BODY_BYTES) return fail(413, 'payload_too_large');

  const timestamp = request.headers.get('X-Anilife-Timestamp') ?? '';
  const parsedTimestamp = /^\d+$/.test(timestamp) ? Number(timestamp) : Number.NaN;
  if (!Number.isSafeInteger(parsedTimestamp)) return fail(401, 'invalid_signature');
  if (Math.abs(nowSeconds - parsedTimestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return fail(401, 'expired_signature');
  }

  let body: ArrayBuffer;
  try {
    body = await readRequestBytesCapped(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError && error.reason === 'request_too_large') {
      return fail(413, 'payload_too_large');
    }
    return fail(400, 'invalid_payload');
  }
  if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) {
    return fail(body.byteLength > MAX_BODY_BYTES ? 413 : 400, 'invalid_payload');
  }
  const signature = request.headers.get('X-Anilife-Signature') ?? '';
  if (!(await validSignature(env.WEB_RELEASE_INDEX_HMAC_KEY, timestamp, body, signature))) {
    return fail(401, 'invalid_signature');
  }

  let index: StableReleaseIndex;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    index = parseStableReleaseIndex(JSON.parse(text));
  } catch {
    return fail(400, 'invalid_release_index');
  }

  const bodyHash = await sha256(body);
  const readLimit = await requireR2Operation(env, 'class_b', nowSeconds);
  if (readLimit) return readLimit;
  let stored: Awaited<ReturnType<typeof readStoredIndex>>;
  try {
    stored = await readStoredIndex(env.RELEASE_INDEX_BUCKET);
  } catch {
    return fail(503, 'release_index_storage_unavailable');
  }

  if (stored && index.sequence < stored.index.sequence) return fail(409, 'release_index_downgrade');
  if (stored && index.sequence === stored.index.sequence && bodyHash !== stored.hash) {
    return fail(409, 'release_index_conflict');
  }

  const idempotent = Boolean(stored && bodyHash === stored.hash);
  if (!idempotent) {
    const writeLimit = await requireR2Operation(env, 'class_a', nowSeconds);
    if (writeLimit) return writeLimit;
    try {
      const written = await env.RELEASE_INDEX_BUCKET.put(INDEX_KEY, body, {
        onlyIf: stored ? { etagMatches: stored.object.etag } : { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: { sha256: bodyHash, sequence: String(index.sequence) },
      });
      if (!written) return fail(409, 'release_index_write_conflict');
    } catch {
      return fail(503, 'release_index_storage_unavailable');
    }
  }

  try {
    const publicUrl = new URL('/downloads/index.json', request.url);
    await cache.delete(new Request(publicUrl));
  } catch {
    return fail(503, 'release_index_cache_unavailable');
  }
  return json({ ok: true, stored: !idempotent, idempotent });
}

export async function getStableReleaseIndex(
  request: Request,
  env: ReleaseIndexEnv,
  nowSeconds = Math.floor(Date.now() / 1000),
  cache: ReleaseIndexCache = (caches as CacheStorage & { default: ReleaseIndexCache }).default
): Promise<Response> {
  if (!env.RELEASE_INDEX_BUCKET) return fail(503, 'release_index_not_configured');

  const publicUrl = new URL('/downloads/index.json', request.url);
  const cacheKey = new Request(publicUrl);
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const etag = cached.headers.get('ETag');
      if (etag && request.headers.get('If-None-Match') === etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: etag, 'Cache-Control': PUBLIC_CACHE_CONTROL },
        });
      }
      return cached;
    }
  } catch {
    // A local cache outage must not hide the published index.
  }

  const readLimit = await requireR2Operation(env, 'class_b', nowSeconds);
  if (readLimit) return readLimit;
  let stored: Awaited<ReturnType<typeof readStoredIndex>>;
  try {
    stored = await readStoredIndex(env.RELEASE_INDEX_BUCKET);
  } catch {
    return fail(503, 'release_index_storage_unavailable');
  }
  if (!stored) return fail(503, 'release_index_unavailable');

  const etag = `"${stored.hash}"`;
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': PUBLIC_CACHE_CONTROL },
    });
  }
  const response = new Response(stored.body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': PUBLIC_CACHE_CONTROL,
      ETag: etag,
    },
  });
  try {
    await cache.put(cacheKey, response.clone());
  } catch {
    // The response remains available; a later request can repopulate this PoP.
  }
  return response;
}
