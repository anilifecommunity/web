import { mediaIndexRelease } from './mediaIndexRelease';

export interface MediaIndexEpisode {
  id?: string;
  number: number;
  title: string;
  image?: string;
  still?: string;
  airDate?: string;
  air_date?: string;
  description?: string;
  overview?: string;
  length?: number;
  runtime?: number;
  rating?: number;
  skipId?: string;
}

export interface MediaIndexSkipData {
  op?: [number, number];
  ed?: [number, number];
  recap?: [number, number];
}

/**
 * Anilife-owned static metadata index, served by jsDelivr.
 *
 * The verified v1 release is primary. The legacy `data/` tree remains a bounded
 * compatibility fallback until the rollout window closes.
 */
const MEDIA_INDEX_BASE = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/data';

type LegacyFetchResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'missing' }
  | { kind: 'failure' };

async function fetchIndexJson<T>(subpath: string): Promise<LegacyFetchResult<T>> {
  try {
    const res = await fetch(`${MEDIA_INDEX_BASE}/${subpath}`);
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) return { kind: 'failure' };
    return { kind: 'ok', data: (await res.json()) as T };
  } catch {
    return { kind: 'failure' };
  }
}

const METADATA_TTL_MS = 5 * 60_000;
const MISSING_TTL_MS = 30_000;
const episodeCache = new Map<number, { value: MediaIndexEpisode[]; expiresAt: number }>();
const episodeInFlight = new Map<number, Promise<MediaIndexEpisode[]>>();
const skipCache = new Map<string, { value: MediaIndexSkipData | null; expiresAt: number }>();
const skipInFlight = new Map<string, Promise<MediaIndexSkipData | null>>();
let dubIndexSet: Set<number> | null = null;
let dubIndexPromise: Promise<number[] | null> | null = null;
let backdropMap: Record<string, string> | null = null;
let backdropPromise: Promise<Record<string, string>> | null = null;

export function mediaIndexShard(anilistId: number): number {
  if (!Number.isFinite(anilistId) || anilistId < 0) return 0;
  return Math.floor(anilistId / 1000);
}

async function loadMediaIndexEpisodes(anilistId: number): Promise<MediaIndexEpisode[]> {
  try {
    const result = await mediaIndexRelease.episodes(anilistId);
    if (result.data.availability === 'NO_CONFIDENT_MATCH') {
      episodeCache.set(anilistId, { value: [], expiresAt: Date.now() + METADATA_TTL_MS });
      return [];
    }
    const episodes = result.data.episodes.map((episode) => ({
      number: episode.number,
      title: episode.title || `Episode ${episode.number}`,
      image: episode.still?.url,
      still: episode.still?.url,
      airDate: episode.airDate || undefined,
      description: episode.synopsis || undefined,
      overview: episode.synopsis || undefined,
      length: episode.runtimeMinutes ?? undefined,
      runtime: episode.runtimeMinutes ?? undefined,
      rating: episode.rating ?? undefined,
    }));
    episodeCache.set(anilistId, { value: episodes, expiresAt: Date.now() + METADATA_TTL_MS });
    return episodes;
  } catch {
    // The legacy compatibility path remains the rollback during the v1 rollout.
  }

  const legacy = await fetchIndexJson<MediaIndexEpisode[]>(
    `anime/${mediaIndexShard(anilistId)}/${anilistId}/episodes.json`
  );
  if (legacy.kind !== 'ok' || !Array.isArray(legacy.data)) return [];
  episodeCache.set(anilistId, { value: legacy.data, expiresAt: Date.now() + METADATA_TTL_MS });
  return legacy.data;
}

export async function fetchMediaIndexEpisodes(anilistId: number): Promise<MediaIndexEpisode[]> {
  const cached = episodeCache.get(anilistId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) episodeCache.delete(anilistId);
  const existing = episodeInFlight.get(anilistId);
  if (existing) return existing;
  const pending = loadMediaIndexEpisodes(anilistId).finally(() => episodeInFlight.delete(anilistId));
  episodeInFlight.set(anilistId, pending);
  return pending;
}

async function loadMediaIndexSkip(anilistId: number, episodeNum: number, malId?: number): Promise<MediaIndexSkipData | null> {
  const path = `skip/${mediaIndexShard(anilistId)}/${anilistId}.json`;
  let data: any = null;
  try {
    data = (await mediaIndexRelease.aux<any>(path)).data;
  } catch {
    const legacy = await fetchIndexJson<any>(path);
    if (legacy.kind === 'ok') data = legacy.data;
  }
  if (data?.episodes?.[String(episodeNum)] && Array.isArray(data.episodes[String(episodeNum)])) {
    const result: MediaIndexSkipData = {};
    for (const item of data.episodes[String(episodeNum)]) {
      const [type, start, end] = item;
      if (type === 'op' || type === 'mixed-op') result.op = [Number(start), Number(end)];
      else if (type === 'ed' || type === 'mixed-ed') result.ed = [Number(start), Number(end)];
      else if (type === 'recap') result.recap = [Number(start), Number(end)];
    }
    return result;
  }

  if (malId) {
    try {
      const aniskipUrl = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=0`;
      const res = await fetch(aniskipUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.found && Array.isArray(json.results)) {
          const result: MediaIndexSkipData = {};
          for (const item of json.results) {
            const type = item.skipType;
            const start = item.interval?.startTime;
            const end = item.interval?.endTime;
            if (typeof start === 'number' && typeof end === 'number') {
              if (type === 'op' || type === 'mixed-op') result.op = [start, end];
              else if (type === 'ed' || type === 'mixed-ed') result.ed = [start, end];
              else if (type === 'recap') result.recap = [start, end];
            }
          }
          return result;
        }
      }
    } catch {}
  }
  return null;
}

export async function fetchMediaIndexSkip(anilistId: number, episodeNum: number, malId?: number): Promise<MediaIndexSkipData | null> {
  const key = `${anilistId}:${episodeNum}:${malId ?? ''}`;
  const cached = skipCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) skipCache.delete(key);
  const existing = skipInFlight.get(key);
  if (existing) return existing;
  const pending = loadMediaIndexSkip(anilistId, episodeNum, malId)
    .then((value) => {
      skipCache.set(key, {
        value,
        expiresAt: Date.now() + (value ? METADATA_TTL_MS : MISSING_TTL_MS),
      });
      return value;
    })
    .finally(() => skipInFlight.delete(key));
  skipInFlight.set(key, pending);
  return pending;
}

export async function isAnimeDubbed(anilistId: number): Promise<boolean | null> {
  if (!dubIndexSet) {
    dubIndexPromise ??= (async () => {
      try {
        const result = await mediaIndexRelease.aux<number[]>('dub/index.json');
        if (Array.isArray(result.data)) return result.data;
      } catch {
        const legacy = await fetchIndexJson<number[]>('dub-index.json');
        if (legacy.kind === 'ok' && Array.isArray(legacy.data)) return legacy.data;
      }
      return null;
    })().finally(() => { dubIndexPromise = null; });
    const ids = await dubIndexPromise;
    if (!ids) return null;
    dubIndexSet = new Set(ids);
  }
  return dubIndexSet.has(anilistId);
}

export async function fetchBackdrops(): Promise<Record<string, string>> {
  if (backdropMap) return backdropMap;
  backdropPromise ??= (async () => {
    let data: { titles?: Record<string, string> } | null = null;
    try {
      data = (await mediaIndexRelease.aux<{ titles?: Record<string, string> }>('backdrops.json')).data;
    } catch {
      const legacy = await fetchIndexJson<{ titles?: Record<string, string> }>('backdrops.json');
      if (legacy.kind === 'ok') data = legacy.data;
    }
    if (!data?.titles) return {};
    backdropMap = data.titles;
    return data.titles;
  })().finally(() => { backdropPromise = null; });
  return backdropPromise;
}

