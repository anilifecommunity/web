import { readTextCapped, safeFetch } from './guards';

const BASE = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main';
const RAW_BASE = 'https://raw.githubusercontent.com/anilifecommunity/media-index/main';
const BASES = [BASE, RAW_BASE];
const HOSTS = new Set(['cdn.jsdelivr.net', 'raw.githubusercontent.com']);
const RELEASE_ID = /^rel-[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const POINTER_MAX = 8 * 1024;
const MANIFEST_MAX = 512 * 1024;
const RECORD_MAX = 1 * 1024 * 1024;
const SESSION_TTL = 5 * 60 * 1000;

interface Descriptor {
  path: string;
  bytes: number;
  sha256: string;
}

interface Pointer {
  contract: 'anilife.media';
  schemaVersion: string;
  releaseId: string;
  releaseManifest: string;
  manifestSha256: string;
  publishedAt: string;
}

interface Manifest {
  contract: 'anilife.media';
  schemaVersion: string;
  releaseId: string;
  sources: Array<{ permitted?: boolean; status?: string }>;
  manifests: {
    media: { files: Descriptor[] };
    episodes: { files: Descriptor[] };
  };
}

interface Session {
  pointer: Pointer;
  manifest: Manifest;
}

export interface VerifiedIndexMedia {
  ids: { anilist: number; mal?: number | null };
  titles: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  status?: string | null;
  format?: string | null;
  episodes?: { declared?: number | null };
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  nextAiringEpisode?: { episode?: number | null; airingAt?: number | null } | null;
}

export interface VerifiedIndexEpisodes {
  availability: 'AVAILABLE' | 'NO_CONFIDENT_MATCH';
  episodes: Array<{ number: number; airDate?: string | null }>;
}

let cachedSession: Session | null = null;
let sessionExpiresAt = 0;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPath(path: unknown): path is string {
  return typeof path === 'string'
    && /^[a-zA-Z0-9._/-]+$/.test(path)
    && !path.startsWith('/')
    && !path.includes('..')
    && !path.includes('//');
}

function validDescriptor(value: unknown): value is Descriptor {
  return isObject(value)
    && validPath(value.path)
    && Number.isSafeInteger(value.bytes)
    && Number(value.bytes) >= 0
    && typeof value.sha256 === 'string'
    && SHA256.test(value.sha256);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJsonAt(
  base: string,
  path: string,
  timeoutMs: number,
  maxBytes: number,
  expected?: Pick<Descriptor, 'bytes' | 'sha256'>,
  expectedSha?: string,
): Promise<unknown> {
  if (!validPath(path)) throw new Error('invalid_media_index_path');
  const response = await safeFetch(
    `${base}/${path}`,
    { headers: { Accept: 'application/json' }, cf: { cacheTtl: 300 } } as RequestInit,
    { allowedHosts: HOSTS, timeoutMs, maxBytes },
  );
  if (!response.ok) throw new Error(`media_index_${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!contentType
    || (contentType !== 'application/json'
    && !contentType.endsWith('+json')
    && !(base === RAW_BASE && contentType === 'text/plain'))) {
    throw new Error('invalid_media_index_content_type');
  }
  const text = await readTextCapped(response, expected ? Math.min(maxBytes, expected.bytes) : maxBytes);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (expected && (bytes !== expected.bytes || await sha256(text) !== expected.sha256)) {
    throw new Error('media_index_integrity');
  }
  if (expectedSha && await sha256(text) !== expectedSha) throw new Error('media_index_integrity');
  return JSON.parse(text) as unknown;
}

async function readJson(
  path: string,
  timeoutMs: number,
  maxBytes: number,
  expected?: Pick<Descriptor, 'bytes' | 'sha256'>,
  expectedSha?: string,
): Promise<unknown> {
  let lastError: unknown;
  for (const base of BASES) {
    try {
      return await readJsonAt(base, path, timeoutMs, maxBytes, expected, expectedSha);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function parsePointer(value: unknown): Pointer {
  if (!isObject(value)
    || value.contract !== 'anilife.media'
    || typeof value.schemaVersion !== 'string'
    || Number(value.schemaVersion.split('.')[0]) !== 1
    || typeof value.releaseId !== 'string'
    || !RELEASE_ID.test(value.releaseId)
    || value.releaseManifest !== `releases/${value.releaseId}/manifest.json`
    || typeof value.manifestSha256 !== 'string'
    || !SHA256.test(value.manifestSha256)
    || typeof value.publishedAt !== 'string'
    || !Number.isFinite(Date.parse(value.publishedAt))) {
    throw new Error('invalid_media_index_pointer');
  }
  return value as unknown as Pointer;
}

function parseManifest(value: unknown, pointer: Pointer): Manifest {
  if (!isObject(value)
    || value.contract !== 'anilife.media'
    || value.schemaVersion !== pointer.schemaVersion
    || value.releaseId !== pointer.releaseId
    || !Array.isArray(value.sources)
    || value.sources.some((source) => !isObject(source) || source.permitted !== true || source.status !== 'verified')
    || !isObject(value.manifests)
    || !isObject(value.manifests.media)
    || !Array.isArray(value.manifests.media.files)
    || !value.manifests.media.files.every(validDescriptor)
    || !isObject(value.manifests.episodes)
    || !Array.isArray(value.manifests.episodes.files)
    || !value.manifests.episodes.files.every(validDescriptor)) {
    throw new Error('invalid_media_index_manifest');
  }
  return value as unknown as Manifest;
}

async function session(timeoutMs: number): Promise<Session> {
  if (cachedSession && Date.now() < sessionExpiresAt) return cachedSession;
  try {
    const pointerCandidates = (await Promise.allSettled(
      BASES.map(async (base) => parsePointer(await readJsonAt(base, 'manifest.json', timeoutMs, POINTER_MAX))),
    ))
      .filter((result): result is PromiseFulfilledResult<Pointer> => result.status === 'fulfilled')
      .map((result) => result.value)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const pointer = pointerCandidates[0];
    if (!pointer) throw new Error('media_index_pointer_unavailable');
    if (cachedSession
      && cachedSession.pointer.releaseId !== pointer.releaseId
      && Date.parse(cachedSession.pointer.publishedAt) > Date.parse(pointer.publishedAt)) {
      return cachedSession;
    }
    const manifestValue = await readJson(
      pointer.releaseManifest,
      timeoutMs,
      MANIFEST_MAX,
      undefined,
      pointer.manifestSha256,
    );
    const manifest = parseManifest(manifestValue, pointer);
    cachedSession = { pointer, manifest };
    sessionExpiresAt = Date.now() + SESSION_TTL;
    return cachedSession;
  } catch (error) {
    if (cachedSession) return cachedSession;
    throw error;
  }
}

async function bucketFor(aniListId: number): Promise<string> {
  const hash = await sha256(`al-${aniListId}`);
  return hash.slice(0, 2);
}

async function record(
  kind: 'media' | 'episodes',
  aniListId: number,
  timeoutMs: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(aniListId) || aniListId < 1) throw new Error('invalid_anilist_id');
  const active = await session(timeoutMs);
  const bucket = await bucketFor(aniListId);
  const bucketPath = `manifests/${kind}/${bucket}.json`;
  const bucketDescriptor = active.manifest.manifests[kind].files.find((file) => file.path === bucketPath);
  if (!bucketDescriptor) throw new Error('media_index_bucket_missing');
  const bucketValue = await readJson(
    `releases/${active.pointer.releaseId}/${bucketPath}`,
    timeoutMs,
    MANIFEST_MAX,
    bucketDescriptor,
  );
  if (!isObject(bucketValue) || !Array.isArray(bucketValue.files) || !bucketValue.files.every(validDescriptor)) {
    throw new Error('invalid_media_index_bucket');
  }
  const recordPath = `${kind}/${bucket}/al-${aniListId}.json`;
  const recordDescriptor = (bucketValue.files as Descriptor[]).find((file) => file.path === recordPath);
  if (!recordDescriptor) throw new Error('media_index_record_missing');
  return readJson(
    `releases/${active.pointer.releaseId}/${recordPath}`,
    timeoutMs,
    RECORD_MAX,
    recordDescriptor,
  );
}

export async function fetchVerifiedMediaIndexMedia(
  aniListId: number,
  timeoutMs: number,
): Promise<VerifiedIndexMedia | null> {
  try {
    const value = await record('media', aniListId, timeoutMs);
    if (!isObject(value)
      || value.mediaKey !== `al-${aniListId}`
      || !isObject(value.ids)
      || value.ids.anilist !== aniListId
      || !isObject(value.titles)) return null;
    return value as unknown as VerifiedIndexMedia;
  } catch {
    return null;
  }
}

export async function fetchVerifiedMediaIndexEpisodes(
  aniListId: number,
  timeoutMs: number,
): Promise<VerifiedIndexEpisodes | null> {
  try {
    const value = await record('episodes', aniListId, timeoutMs);
    if (!isObject(value)
      || value.mediaKey !== `al-${aniListId}`
      || !['AVAILABLE', 'NO_CONFIDENT_MATCH'].includes(String(value.availability))
      || !Array.isArray(value.episodes)) return null;
    return value as unknown as VerifiedIndexEpisodes;
  } catch {
    return null;
  }
}

export function resetMediaIndexV1Cache(): void {
  cachedSession = null;
  sessionExpiresAt = 0;
}
