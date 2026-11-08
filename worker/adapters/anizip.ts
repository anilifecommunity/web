import type { AdapterContext } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { readTextCapped, safeFetch } from '../guards';

const BASE = 'https://api.ani.zip';
const HOSTS = new Set(['api.ani.zip']);
const MAX_JSON = 512_000;

export interface AniZipEpisode {
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  airDate?: string;
}

export interface AniZipMapping {
  mappings?: {
    themoviedb_id?: string | number | null;
    imdb_id?: string | null;
    mal_id?: number | null;
    type?: string | null;
  };
  episodes?: Record<string, AniZipEpisode>;
}

export async function fetchAniZip(
  aniListId: number,
  context: AdapterContext
): Promise<AniZipMapping> {
  const response = await safeFetch(
    `${BASE}/mappings?anilist_id=${aniListId}`,
    { signal: context.signal, headers: { Accept: 'application/json' } },
    { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: MAX_JSON }
  );
  if (!response.ok) throw new ResolverError('provider_unavailable');
  const text = await readTextCapped(response, MAX_JSON);
  try {
    return JSON.parse(text) as AniZipMapping;
  } catch {
    throw new ResolverError('invalid_response');
  }
}

export function findAniZipEpisode(
  data: AniZipMapping,
  episodeRef: string
): { season: number; episode: number } | null {
  const requested = Number(episodeRef);
  if (!Number.isFinite(requested) || requested < 1) return null;

  const direct = data.episodes?.[String(requested)];
  if (direct) {
    return {
      season: direct.seasonNumber ?? 1,
      episode: direct.episodeNumber ?? requested,
    };
  }

  for (const entry of Object.values(data.episodes ?? {})) {
    if (entry.episodeNumber === requested || entry.absoluteEpisodeNumber === requested) {
      return {
        season: entry.seasonNumber ?? 1,
        episode: entry.episodeNumber ?? requested,
      };
    }
  }

  return null;
}

export function anizipTmdb(data: AniZipMapping): string | null {
  const tmdb = data.mappings?.themoviedb_id;
  if (tmdb === null || tmdb === undefined || String(tmdb).trim() === '') return null;
  return String(tmdb);
}

export function anizipImdb(data: AniZipMapping): string | null {
  const imdb = data.mappings?.imdb_id;
  if (imdb === null || imdb === undefined || String(imdb).trim() === '') return null;
  return String(imdb);
}
