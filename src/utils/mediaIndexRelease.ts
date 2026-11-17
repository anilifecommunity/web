import { getRecord, putRecord } from '../data/idb';

export type MediaIndexFailureCode =
  | 'offline'
  | 'timeout'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_content_type'
  | 'too_large'
  | 'malformed'
  | 'integrity'
  | 'unsupported_schema'
  | 'rights_blocked';

export type MediaIndexDataState = 'INDEX' | 'LOCAL';

export class MediaIndexError extends Error {
  constructor(
    public readonly code: MediaIndexFailureCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MediaIndexError';
  }
}

export interface MediaIndexCounts {
  media: number;
  episodeLists: number;
  episodes: number;
  relations: number;
  adult: number;
  auxFiles: number;
}

export interface MediaIndexPointer {
  schemaVersion: string;
  contract: 'anilife.media';
  releaseId: string;
  releaseManifest: string;
  contentHash: string;
  manifestSha256: string;
  generatedAt: string;
  publishedAt: string;
  counts: MediaIndexCounts;
}

export interface MediaIndexFileDescriptor {
  path: string;
  bytes: number;
  sha256: string;
}

interface MediaIndexFileList {
  files: MediaIndexFileDescriptor[];
}

export interface MediaIndexSource {
  name: string;
  status: 'verified' | 'unverified' | 'degraded' | 'blocked';
  permitted: boolean;
  permissionReference?: string | null;
  lastUpdated?: string | null;
}

export interface MediaIndexReleaseManifest {
  schemaVersion: string;
  contract: 'anilife.media';
  releaseId: string;
  generatedAt: string;
  contentHash: string;
  counts: MediaIndexCounts;
  sources: MediaIndexSource[];
  catalog: MediaIndexFileList;
  home: MediaIndexFileDescriptor;
  browse: MediaIndexFileDescriptor;
  search: MediaIndexFileList;
  identity: { ledger: MediaIndexFileDescriptor };
  ids: MediaIndexFileList;
  aux: MediaIndexFileList;
  manifests: {
    media: MediaIndexFileList;
    episodes: MediaIndexFileList;
  };
}

export interface MediaIndexSession {
  pointer: MediaIndexPointer;
  manifest: MediaIndexReleaseManifest;
  state: MediaIndexDataState;
  failure?: MediaIndexFailureCode;
}

export interface MediaIndexResult<T> {
  data: T;
  releaseId: string;
  generatedAt: string;
  state: MediaIndexDataState;
  failure?: MediaIndexFailureCode;
}

interface CachedJson<T = unknown> {
  value: T;
  bytes: number;
  sha256: string;
  verifiedAt: number;
}

export interface MediaIndexCache {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface MediaIndexClientOptions {
  baseUrl?: string;
  fallbackBaseUrl?: string;
  fetch?: typeof fetch;
  cache?: MediaIndexCache;
  timeoutMs?: number;
  sessionTtlMs?: number;
}

export interface MediaIndexTitleSet {
  english: string | null;
  romaji: string | null;
  native: string | null;
  display?: string | null;
}

export interface MediaIndexCompactRow {
  mediaKey: string;
  anilistId: number;
  titles: MediaIndexTitleSet;
  poster: { url: string; source: string; color?: string | null } | null;
  year: number | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  episodesAvailable: boolean;
  score: number | null;
  popularity: number | null;
  genres: string[];
  isAdult: boolean | null;
  visibility: 'general' | 'adult' | 'unknown-conservative';
}

export interface MediaIndexHome {
  schemaVersion: string;
  generatedAt: string;
  rows: Record<'spotlight' | 'trending' | 'popular' | 'topRated' | 'season' | 'newest' | 'upcoming' | 'movies', MediaIndexCompactRow[]>;
}

export interface MediaIndexBrowse {
  schemaVersion: string;
  generatedAt: string;
  rows: MediaIndexCompactRow[];
}

export interface MediaIndexRelationNode {
  id?: number;
  title?: MediaIndexTitleSet & { userPreferred?: string | null };
  poster?: string | null;
  format?: string | null;
  countryOfOrigin?: string | null;
  description?: string | null;
  isAdult?: boolean | null;
  episodes?: number | null;
}

export interface MediaIndexMediaRecord {
  schemaVersion: string;
  mediaKey: string;
  kind: 'ANIME';
  ids: { anilist: number; mal?: number | null } & Record<string, number | null | undefined>;
  titles: MediaIndexTitleSet & { synonyms: Array<{ value: string; language?: string | null; source: string }> };
  bangumi?: { confidence?: string; id?: number; names?: string[] } | null;
  synopsis?: { text: string; language?: string | null; source: string; spoiler?: boolean } | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes: { declared: number | null; available: boolean; numbering?: 'position' };
  durationMinutes?: number | null;
  genres?: string[];
  score?: { value: number; scale: number; source: string } | null;
  popularity?: number | null;
  isAdult: boolean | null;
  visibility: 'general' | 'adult' | 'unknown-conservative';
  startDate?: { year: number; month?: number | null; day?: number | null } | null;
  studios?: Array<{ id: number; name: string; animation?: boolean }>;
  images?: {
    poster?: { url: string; source: string; color?: string | null };
    banner?: { url: string; source: string };
    logo?: { url: string; source: string };
  };
  relations?: Array<{
    relationType: string;
    kind: 'ANIME' | 'MANGA' | 'UNKNOWN';
    ids: { anilist: number; mal?: number | null };
    mediaKey: string | null;
    resolved: boolean;
    name?: string | null;
    node?: MediaIndexRelationNode;
  }>;
  recommendations?: Array<{
    ids: { anilist: number };
    mediaKey: string | null;
    resolved: boolean;
    card?: {
      id: number;
      title?: MediaIndexTitleSet & { userPreferred?: string | null };
      coverImage?: { extraLarge?: string | null; large?: string | null };
      format?: string | null;
      seasonYear?: number | null;
      episodes?: number | null;
      isAdult?: boolean | null;
    };
  }>;
  seriesIds?: number[];
  trailer?: { id?: string; site?: string } | null;
  nextAiringEpisode?: { episode?: number; airingAt?: number; timeUntilAiring?: number } | null;
  provenance: { source: string; updatedAt?: string };
}

export interface MediaIndexEpisodeRecord {
  schemaVersion: string;
  mediaKey: string;
  kind: 'ANIME';
  availability: 'AVAILABLE' | 'NO_CONFIDENT_MATCH';
  numbering?: 'position';
  episodes: Array<{
    number: number;
    title: string | null;
    synopsis?: string | null;
    airDate: string | null;
    runtimeMinutes?: number | null;
    rating?: number | null;
    still: { url: string; source: string } | null;
    source: string;
  }>;
  provenance: { source: string; updatedAt?: string; match?: string | null };
}

export interface MediaIndexSearchShard {
  schemaVersion: string;
  bucket: string;
  rows: Array<{
    mediaKey: string;
    names: string[];
    visibility: 'general' | 'adult' | 'unknown-conservative';
  }>;
}

export interface MediaIndexScheduleRow {
  id: number;
  episode: number;
  airingAt: number;
  english?: string;
  romaji?: string;
  native?: string;
  cover?: string;
  format?: string;
  year?: number;
  adult?: boolean;
}

export interface MediaIndexBucketManifest {
  schemaVersion?: string;
  bucket?: string;
  files: MediaIndexFileDescriptor[];
}

const DEFAULT_BASE = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main';
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com/anilifecommunity/media-index/main';
const SUPPORTED_SCHEMA_MAJOR = 1;
const POINTER_MAX_BYTES = 8 * 1024;
const MANIFEST_MAX_BYTES = 512 * 1024;
const ABSOLUTE_JSON_MAX_BYTES = 16 * 1024 * 1024;
const RELEASE_ID = /^rel-[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

const idbCache: MediaIndexCache = {
  get: (key) => getRecord('media_index', key),
  put: (key, value) => putRecord('media_index', key, value),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validCounts(value: unknown): value is MediaIndexCounts {
  if (!isRecord(value)) return false;
  return ['media', 'episodeLists', 'episodes', 'relations', 'adult', 'auxFiles']
    .every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0);
}

function validDescriptor(value: unknown): value is MediaIndexFileDescriptor {
  if (!isRecord(value)) return false;
  return typeof value.path === 'string'
    && safeRelativePath(value.path)
    && Number.isSafeInteger(value.bytes)
    && Number(value.bytes) >= 0
    && typeof value.sha256 === 'string'
    && SHA256.test(value.sha256);
}

function validFileList(value: unknown): value is MediaIndexFileList {
  return isRecord(value) && Array.isArray(value.files) && value.files.every(validDescriptor);
}

function safeRelativePath(path: string): boolean {
  return path.length > 0
    && path.length <= 240
    && SAFE_PATH.test(path)
    && !path.startsWith('/')
    && !path.includes('..')
    && !path.includes('//');
}

export function validateMediaIndexPointer(value: unknown): MediaIndexPointer {
  if (isRecord(value)
    && typeof value.schemaVersion === 'string'
    && Number(value.schemaVersion.split('.')[0]) !== SUPPORTED_SCHEMA_MAJOR) {
    throw new MediaIndexError('unsupported_schema', 'This Media Index schema is not supported by this Anilife version.');
  }
  if (!isRecord(value)
    || value.contract !== 'anilife.media'
    || typeof value.schemaVersion !== 'string'
    || typeof value.releaseId !== 'string'
    || !RELEASE_ID.test(value.releaseId)
    || value.releaseManifest !== `releases/${value.releaseId}/manifest.json`
    || typeof value.contentHash !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(value.contentHash)
    || typeof value.manifestSha256 !== 'string'
    || !SHA256.test(value.manifestSha256)
    || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || typeof value.publishedAt !== 'string'
    || !Number.isFinite(Date.parse(value.publishedAt))
    || !validCounts(value.counts)) {
    throw new MediaIndexError('malformed', 'The Media Index pointer is invalid.');
  }
  return value as unknown as MediaIndexPointer;
}

export function validateMediaIndexManifest(value: unknown, pointer: MediaIndexPointer): MediaIndexReleaseManifest {
  if (!isRecord(value)
    || value.contract !== 'anilife.media'
    || value.schemaVersion !== pointer.schemaVersion
    || value.releaseId !== pointer.releaseId
    || value.contentHash !== pointer.contentHash
    || !validCounts(value.counts)
    || !Array.isArray(value.sources)
    || !validFileList(value.catalog)
    || !validDescriptor(value.home)
    || !validDescriptor(value.browse)
    || !validFileList(value.search)
    || !validFileList(value.ids)
    || !validFileList(value.aux)
    || !isRecord(value.identity)
    || !validDescriptor(value.identity.ledger)
    || !isRecord(value.manifests)
    || !validFileList(value.manifests.media)
    || !validFileList(value.manifests.episodes)) {
    throw new MediaIndexError('malformed', 'The Media Index release manifest is invalid.');
  }

  const manifest = value as unknown as MediaIndexReleaseManifest;
  if (manifest.sources.some((source) => !source.permitted || source.status !== 'verified')) {
    throw new MediaIndexError('rights_blocked', 'The Media Index release is not approved for client use.');
  }
  return manifest;
}

function classifyFetchFailure(error: unknown): MediaIndexError {
  if (error instanceof MediaIndexError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new MediaIndexError('timeout', 'The Media Index request timed out.');
  }
  return new MediaIndexError('offline', 'The Media Index could not be reached.');
}

function statusError(response: Response): MediaIndexError {
  if (response.status === 404) return new MediaIndexError('not_found', 'The Media Index file was not found.', 404);
  if (response.status === 429) return new MediaIndexError('rate_limited', 'The Media Index request was rate limited.', 429);
  return new MediaIndexError('unavailable', 'The Media Index is temporarily unavailable.', response.status);
}

function requestSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJsonResponse<T>(
  response: Response,
  maxBytes: number,
  expected?: MediaIndexFileDescriptor,
  allowTrustedPlainJson = false,
): Promise<CachedJson<T>> {
  if (!response.ok) throw statusError(response);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!contentType
    || (contentType !== 'application/json'
    && !contentType.endsWith('+json')
    && !(allowTrustedPlainJson && contentType === 'text/plain'))) {
    throw new MediaIndexError('invalid_content_type', 'The Media Index returned a non-JSON response.');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new MediaIndexError('too_large', 'The Media Index response exceeded its size budget.');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new MediaIndexError('too_large', 'The Media Index response exceeded its size budget.');
  }
  if (expected && buffer.byteLength !== expected.bytes) {
    throw new MediaIndexError('integrity', `The Media Index byte count did not match ${expected.path}.`);
  }

  const bytes = new Uint8Array(buffer);
  const hash = await sha256Hex(bytes);
  if (expected && hash !== expected.sha256) {
    throw new MediaIndexError('integrity', `The Media Index checksum did not match ${expected.path}.`);
  }

  try {
    return {
      value: JSON.parse(new TextDecoder().decode(bytes)) as T,
      bytes: buffer.byteLength,
      sha256: hash,
      verifiedAt: Date.now(),
    };
  } catch {
    throw new MediaIndexError('malformed', 'The Media Index returned malformed JSON.');
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (!safeRelativePath(path)) throw new MediaIndexError('malformed', 'An unsafe Media Index path was rejected.');
  return `${baseUrl.replace(/\/$/, '')}/${path}`;
}

function cachedJsonKey(releaseId: string, path: string): string {
  return `json:${releaseId}:${path}`;
}

function findDescriptor(manifest: MediaIndexReleaseManifest, path: string): MediaIndexFileDescriptor | null {
  if (manifest.home.path === path) return manifest.home;
  if (manifest.browse.path === path) return manifest.browse;
  if (manifest.identity.ledger.path === path) return manifest.identity.ledger;
  const lists = [
    manifest.catalog.files,
    manifest.search.files,
    manifest.ids.files,
    manifest.aux.files,
    manifest.manifests.media.files,
    manifest.manifests.episodes.files,
  ];
  for (const files of lists) {
    const descriptor = files.find((file) => file.path === path);
    if (descriptor) return descriptor;
  }
  return null;
}

function validateCompactRow(value: unknown): value is MediaIndexCompactRow {
  if (!isRecord(value)
    || typeof value.mediaKey !== 'string'
    || !/^al-[1-9][0-9]*$/.test(value.mediaKey)
    || !Number.isSafeInteger(value.anilistId)
    || !isRecord(value.titles)
    || !Array.isArray(value.genres)
    || !['general', 'adult', 'unknown-conservative'].includes(String(value.visibility))) return false;
  return true;
}

function validateHome(value: unknown): MediaIndexHome {
  if (!isRecord(value) || typeof value.generatedAt !== 'string' || !isRecord(value.rows)) {
    throw new MediaIndexError('malformed', 'The Media Index home catalogue is invalid.');
  }
  const rows = value.rows;
  const keys = ['spotlight', 'trending', 'popular', 'topRated', 'season', 'newest', 'upcoming', 'movies'];
  if (!keys.every((key) => Array.isArray(rows[key]) && (rows[key] as unknown[]).every(validateCompactRow))) {
    throw new MediaIndexError('malformed', 'The Media Index home rows are invalid.');
  }
  return value as unknown as MediaIndexHome;
}

function validateBrowse(value: unknown): MediaIndexBrowse {
  if (!isRecord(value) || !Array.isArray(value.rows) || !value.rows.every(validateCompactRow)) {
    throw new MediaIndexError('malformed', 'The Media Index browse catalogue is invalid.');
  }
  return value as unknown as MediaIndexBrowse;
}

function validateSchedule(value: unknown): MediaIndexScheduleRow[] {
  if (!Array.isArray(value) || !value.every((row) => isRecord(row)
    && Number.isSafeInteger(row.id)
    && Number(row.id) > 0
    && Number.isSafeInteger(row.episode)
    && Number(row.episode) > 0
    && Number.isSafeInteger(row.airingAt)
    && Number(row.airingAt) > 0
    && (row.english === undefined || typeof row.english === 'string')
    && (row.romaji === undefined || typeof row.romaji === 'string')
    && (row.native === undefined || typeof row.native === 'string')
    && (row.cover === undefined || typeof row.cover === 'string')
    && (row.adult === undefined || typeof row.adult === 'boolean'))) {
    throw new MediaIndexError('malformed', 'The Media Index schedule is invalid.');
  }
  return value as MediaIndexScheduleRow[];
}

function validateBucketManifest(value: unknown): MediaIndexBucketManifest {
  if (!isRecord(value) || !Array.isArray(value.files) || !value.files.every(validDescriptor)) {
    throw new MediaIndexError('malformed', 'The Media Index bucket manifest is invalid.');
  }
  return value as unknown as MediaIndexBucketManifest;
}

function validateMediaRecord(value: unknown, anilistId: number): MediaIndexMediaRecord {
  if (!isRecord(value)
    || value.mediaKey !== `al-${anilistId}`
    || value.kind !== 'ANIME'
    || !isRecord(value.ids)
    || value.ids.anilist !== anilistId
    || !isRecord(value.titles)
    || !isRecord(value.episodes)
    || !['general', 'adult', 'unknown-conservative'].includes(String(value.visibility))
    || !isRecord(value.provenance)) {
    throw new MediaIndexError('malformed', 'The Media Index media record is invalid.');
  }
  return value as unknown as MediaIndexMediaRecord;
}

function validateEpisodeRecord(value: unknown, anilistId: number): MediaIndexEpisodeRecord {
  if (!isRecord(value)
    || value.mediaKey !== `al-${anilistId}`
    || value.kind !== 'ANIME'
    || !['AVAILABLE', 'NO_CONFIDENT_MATCH'].includes(String(value.availability))
    || !Array.isArray(value.episodes)
    || !isRecord(value.provenance)) {
    throw new MediaIndexError('malformed', 'The Media Index episode record is invalid.');
  }
  return value as unknown as MediaIndexEpisodeRecord;
}

export function createMediaIndexClient(options: MediaIndexClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  const fallbackBaseUrl = options.fallbackBaseUrl === undefined
    ? (baseUrl === DEFAULT_BASE ? RAW_GITHUB_BASE : null)
    : options.fallbackBaseUrl.replace(/\/$/, '');
  const baseUrls = [baseUrl, ...(fallbackBaseUrl && fallbackBaseUrl !== baseUrl ? [fallbackBaseUrl] : [])];
  const fetcher: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const cache = options.cache ?? idbCache;
  const timeoutMs = options.timeoutMs ?? 6_000;
  const sessionTtlMs = options.sessionTtlMs ?? 5 * 60_000;
  let sessionPromise: Promise<MediaIndexSession> | null = null;
  let sessionExpiresAt = 0;

  async function fetchJsonAt<T>(base: string, path: string, maxBytes: number, expected?: MediaIndexFileDescriptor): Promise<CachedJson<T>> {
    const request = requestSignal(timeoutMs);
    try {
      const response = await fetcher(joinUrl(base, path), {
        headers: { Accept: 'application/json' },
        cache: path === 'manifest.json' ? 'no-cache' : 'force-cache',
        signal: request.signal,
      });
      return await readJsonResponse<T>(response, maxBytes, expected, base === RAW_GITHUB_BASE);
    } catch (error) {
      throw classifyFetchFailure(error);
    } finally {
      request.cancel();
    }
  }

  async function fetchJson<T>(path: string, maxBytes: number, expected?: MediaIndexFileDescriptor): Promise<CachedJson<T>> {
    let lastError: unknown;
    for (const base of baseUrls) {
      try {
        return await fetchJsonAt<T>(base, path, maxBytes, expected);
      } catch (error) {
        lastError = error;
      }
    }
    throw classifyFetchFailure(lastError);
  }

  async function loadSession(): Promise<MediaIndexSession> {
    let remoteFailure: MediaIndexFailureCode | undefined;
    try {
      const pointerResults = await Promise.allSettled(
        baseUrls.map(async (base) => validateMediaIndexPointer(
          (await fetchJsonAt<unknown>(base, 'manifest.json', POINTER_MAX_BYTES)).value,
        )),
      );
      const pointerCandidates = pointerResults
        .filter((result): result is PromiseFulfilledResult<MediaIndexPointer> => result.status === 'fulfilled')
        .map((result) => result.value)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      const pointer = pointerCandidates[0];
      if (!pointer) {
        const rejection = pointerResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw rejection ? classifyFetchFailure(rejection.reason) : new MediaIndexError('unavailable', 'No valid Media Index pointer is available.');
      }
      const lastVerifiedPointer = await cache.get<MediaIndexPointer>('pointer:last-verified');
      if (lastVerifiedPointer
        && lastVerifiedPointer.releaseId !== pointer.releaseId
        && Date.parse(lastVerifiedPointer.publishedAt) > Date.parse(pointer.publishedAt)) {
        const cachedManifest = await cache.get<MediaIndexReleaseManifest>(`manifest:${lastVerifiedPointer.releaseId}`);
        if (cachedManifest) {
          return {
            pointer: validateMediaIndexPointer(lastVerifiedPointer),
            manifest: validateMediaIndexManifest(cachedManifest, lastVerifiedPointer),
            state: 'LOCAL',
            failure: 'unavailable',
          };
        }
      }
      const descriptor: MediaIndexFileDescriptor = {
        path: pointer.releaseManifest,
        bytes: MANIFEST_MAX_BYTES,
        sha256: pointer.manifestSha256,
      };
      let bytes: Uint8Array | null = null;
      let manifestError: unknown;
      for (const base of baseUrls) {
        const request = requestSignal(timeoutMs);
        try {
          const response = await fetcher(joinUrl(base, pointer.releaseManifest), {
            headers: { Accept: 'application/json' },
            cache: 'force-cache',
            signal: request.signal,
          });
          if (!response.ok) throw statusError(response);
          const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (!contentType
            || (contentType !== 'application/json'
            && !contentType.endsWith('+json')
            && !(base === RAW_GITHUB_BASE && contentType === 'text/plain'))) {
            throw new MediaIndexError('invalid_content_type', 'The Media Index returned a non-JSON release manifest.');
          }
          const declaredLength = Number(response.headers.get('content-length'));
          if (Number.isFinite(declaredLength) && declaredLength > MANIFEST_MAX_BYTES) {
            throw new MediaIndexError('too_large', 'The Media Index release manifest exceeded its size budget.');
          }
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > MANIFEST_MAX_BYTES) {
            throw new MediaIndexError('too_large', 'The Media Index release manifest exceeded its size budget.');
          }
          const candidate = new Uint8Array(buffer);
          if (await sha256Hex(candidate) !== descriptor.sha256) {
            throw new MediaIndexError('integrity', 'The Media Index release manifest checksum did not match the pointer.');
          }
          bytes = candidate;
          break;
        } catch (error) {
          manifestError = error;
        } finally {
          request.cancel();
        }
      }
      if (!bytes) throw classifyFetchFailure(manifestError);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new MediaIndexError('malformed', 'The Media Index release manifest is malformed.');
      }
      const manifest = validateMediaIndexManifest(parsed, pointer);
      await cache.put(`manifest:${pointer.releaseId}`, manifest);
      await cache.put('pointer:last-verified', pointer);
      return { pointer, manifest, state: 'INDEX' };
    } catch (error) {
      remoteFailure = classifyFetchFailure(error).code;
    }

    const cachedPointer = await cache.get<MediaIndexPointer>('pointer:last-verified');
    if (!cachedPointer) throw new MediaIndexError(remoteFailure ?? 'unavailable', 'No verified Media Index release is available.');
    const pointer = validateMediaIndexPointer(cachedPointer);
    const cachedManifest = await cache.get<MediaIndexReleaseManifest>(`manifest:${pointer.releaseId}`);
    if (!cachedManifest) throw new MediaIndexError(remoteFailure ?? 'unavailable', 'No verified Media Index release manifest is available.');
    const manifest = validateMediaIndexManifest(cachedManifest, pointer);
    return { pointer, manifest, state: 'LOCAL', failure: remoteFailure };
  }

  async function getSession(): Promise<MediaIndexSession> {
    if (sessionPromise && Date.now() < sessionExpiresAt) return sessionPromise;
    sessionPromise = loadSession();
    sessionExpiresAt = Date.now() + sessionTtlMs;
    try {
      const session = await sessionPromise;
      if (session.state === 'LOCAL') sessionExpiresAt = Math.min(sessionExpiresAt, Date.now() + 30_000);
      return session;
    } catch (error) {
      sessionPromise = null;
      sessionExpiresAt = 0;
      throw error;
    }
  }

  async function fetchDescriptorJson<T>(session: MediaIndexSession, descriptor: MediaIndexFileDescriptor): Promise<MediaIndexResult<T>> {
    const key = cachedJsonKey(session.pointer.releaseId, descriptor.path);
    try {
      const remote = await fetchJson<T>(
        `releases/${session.pointer.releaseId}/${descriptor.path}`,
        Math.min(ABSOLUTE_JSON_MAX_BYTES, Math.max(descriptor.bytes, 1)),
        descriptor,
      );
      await cache.put(key, remote);
      return {
        data: remote.value,
        releaseId: session.pointer.releaseId,
        generatedAt: session.manifest.generatedAt,
        state: session.state,
        failure: session.failure,
      };
    } catch (error) {
      const failure = classifyFetchFailure(error).code;
      const cached = await cache.get<CachedJson<T>>(key);
      if (!cached || cached.bytes !== descriptor.bytes || cached.sha256 !== descriptor.sha256) throw error;
      return {
        data: cached.value,
        releaseId: session.pointer.releaseId,
        generatedAt: session.manifest.generatedAt,
        state: 'LOCAL',
        failure,
      };
    }
  }

  async function fetchManifestPath<T>(session: MediaIndexSession, path: string): Promise<MediaIndexResult<T>> {
    const descriptor = findDescriptor(session.manifest, path);
    if (!descriptor) throw new MediaIndexError('not_found', `The Media Index manifest does not contain ${path}.`);
    return fetchDescriptorJson<T>(session, descriptor);
  }

  async function mediaBucket(anilistId: number): Promise<string> {
    if (!Number.isSafeInteger(anilistId) || anilistId <= 0) {
      throw new MediaIndexError('malformed', 'A valid AniList id is required.');
    }
    return (await sha256Hex(new TextEncoder().encode(`al-${anilistId}`))).slice(0, 2);
  }

  async function fetchBucketRecord<T>(
    session: MediaIndexSession,
    kind: 'media' | 'episodes',
    anilistId: number,
  ): Promise<MediaIndexResult<T>> {
    const bucket = await mediaBucket(anilistId);
    const bucketPath = `manifests/${kind}/${bucket}.json`;
    const bucketResult = await fetchManifestPath<unknown>(session, bucketPath);
    const bucketManifest = validateBucketManifest(bucketResult.data);
    const recordPath = `${kind}/${bucket}/al-${anilistId}.json`;
    const descriptor = bucketManifest.files.find((file) => file.path === recordPath);
    if (!descriptor) throw new MediaIndexError('not_found', `No verified ${kind} record exists for AniList ${anilistId}.`, 404);
    const result = await fetchDescriptorJson<T>(session, descriptor);
    if (bucketResult.state === 'LOCAL' && result.state === 'INDEX') {
      return { ...result, state: 'LOCAL', failure: bucketResult.failure };
    }
    return result;
  }

  return {
    getSession,

    async home(): Promise<MediaIndexResult<MediaIndexHome>> {
      const session = await getSession();
      const result = await fetchDescriptorJson<unknown>(session, session.manifest.home);
      return { ...result, data: validateHome(result.data) };
    },

    async browse(): Promise<MediaIndexResult<MediaIndexBrowse>> {
      const session = await getSession();
      const result = await fetchDescriptorJson<unknown>(session, session.manifest.browse);
      return { ...result, data: validateBrowse(result.data) };
    },

    async media(anilistId: number): Promise<MediaIndexResult<MediaIndexMediaRecord>> {
      const session = await getSession();
      const result = await fetchBucketRecord<unknown>(session, 'media', anilistId);
      return { ...result, data: validateMediaRecord(result.data, anilistId) };
    },

    async episodes(anilistId: number): Promise<MediaIndexResult<MediaIndexEpisodeRecord>> {
      const session = await getSession();
      const result = await fetchBucketRecord<unknown>(session, 'episodes', anilistId);
      return { ...result, data: validateEpisodeRecord(result.data, anilistId) };
    },

    async searchBucket(bucket: string): Promise<MediaIndexResult<MediaIndexSearchShard>> {
      if (!/^(?:[a-z]|num|other-[0-7])$/.test(bucket)) {
        throw new MediaIndexError('malformed', 'An invalid Media Index search bucket was rejected.');
      }
      const session = await getSession();
      const result = await fetchManifestPath<unknown>(session, `search/universal/${bucket}.json`);
      if (!isRecord(result.data)
        || result.data.bucket !== bucket
        || !Array.isArray(result.data.rows)
        || !result.data.rows.every((row) => isRecord(row)
          && typeof row.mediaKey === 'string'
          && Array.isArray(row.names)
          && row.names.every((name) => typeof name === 'string'))) {
        throw new MediaIndexError('malformed', 'The Media Index search bucket is invalid.');
      }
      return { ...result, data: result.data as unknown as MediaIndexSearchShard };
    },

    async schedule(year: number, month: number): Promise<MediaIndexResult<MediaIndexScheduleRow[]>> {
      if (!Number.isSafeInteger(year) || year < 2000 || year > 2200 || !Number.isSafeInteger(month) || month < 1 || month > 12) {
        throw new MediaIndexError('malformed', 'An invalid Media Index schedule month was rejected.');
      }
      const session = await getSession();
      const result = await fetchManifestPath<unknown>(session, `schedule/${year}-${String(month).padStart(2, '0')}.json`);
      return { ...result, data: validateSchedule(result.data) };
    },

    async aux<T>(path: string): Promise<MediaIndexResult<T>> {
      const session = await getSession();
      return fetchManifestPath<T>(session, path);
    },

    mediaBucket,
  };
}

export const mediaIndexRelease = createMediaIndexClient();

export function normalizeMediaIndexSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

export async function mediaIndexSearchBucket(query: string): Promise<string> {
  const normalized = normalizeMediaIndexSearch(query);
  const first = Array.from(normalized)[0];
  if (!first) throw new MediaIndexError('malformed', 'A search query is required.');
  if (/^[a-z]$/.test(first)) return first;
  if (/^[0-9]$/.test(first)) return 'num';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first));
  const bytes = new Uint8Array(hash);
  return `other-${bytes[bytes.length - 1] % 8}`;
}

export async function searchMediaIndex(
  query: string,
  hideAdultContent: boolean,
): Promise<MediaIndexResult<MediaIndexCompactRow[]>> {
  const normalized = normalizeMediaIndexSearch(query);
  const bucket = await mediaIndexSearchBucket(normalized);
  const [searchResult, browseResult] = await Promise.all([
    mediaIndexRelease.searchBucket(bucket),
    mediaIndexRelease.browse(),
  ]);
  if (searchResult.releaseId !== browseResult.releaseId) {
    throw new MediaIndexError('integrity', 'Media Index search attempted to mix two releases.');
  }

  const ranked = searchResult.data.rows
    .filter((row) => mediaIndexVisibilityAllowed(row.visibility, hideAdultContent))
    .map((row) => {
      const names = row.names.map(normalizeMediaIndexSearch);
      const exact = names.some((name) => name === normalized);
      const prefix = names.some((name) => name.startsWith(normalized));
      const substring = names.some((name) => name.includes(normalized));
      return { row, rank: exact ? 0 : prefix ? 1 : substring ? 2 : 3 };
    })
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.row.mediaKey.localeCompare(b.row.mediaKey));

  const byKey = new Map(browseResult.data.rows.map((row) => [row.mediaKey, row]));
  const rows = ranked
    .map((entry) => byKey.get(entry.row.mediaKey))
    .filter((row): row is MediaIndexCompactRow => Boolean(row));

  return {
    data: rows,
    releaseId: searchResult.releaseId,
    generatedAt: searchResult.generatedAt,
    state: searchResult.state === 'LOCAL' || browseResult.state === 'LOCAL' ? 'LOCAL' : 'INDEX',
    failure: searchResult.failure ?? browseResult.failure,
  };
}

export function mediaIndexVisibilityAllowed(
  visibility: MediaIndexCompactRow['visibility'],
  hideAdultContent: boolean,
): boolean {
  return !hideAdultContent || visibility === 'general';
}
