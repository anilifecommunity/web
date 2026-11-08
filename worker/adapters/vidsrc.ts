import type { AdapterContext, PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { readTextCapped, safeFetch } from '../guards';

const BASE = 'https://api.ani.zip';
const HOSTS = new Set(['api.ani.zip']);
const MAX_JSON = 512_000;

interface AniZipEpisode {
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  airDate?: string;
}

interface AniZipMapping {
  mappings?: {
    themoviedb_id?: string | number | null;
    imdb_id?: string | null;
    mal_id?: number | null;
    type?: string | null;
  };
  episodes?: Record<string, AniZipEpisode>;
}

async function fetchMapping(aniListId: number, context: AdapterContext): Promise<AniZipMapping> {
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

export function findEpisode(
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

export function buildEmbedUrl(
  tmdb: string,
  movie: boolean,
  season: number,
  episode: number
): string {
  return movie
    ? `https://vidsrc.to/embed/movie/${encodeURIComponent(tmdb)}`
    : `https://vidsrc.to/embed/tv/${encodeURIComponent(tmdb)}/${season}/${episode}`;
}

/**
 * VidSrc is an embed index, not a catalogue. AniZip maps the AniList title and episode to a
 * TheMovieDB id and season/episode, then the browser loads the provider player directly.
 * The embed page answered 200 without X-Frame-Options on 2026-11-08; media startup still
 * requires a real user test, so this stays a fallback behind Reanime.
 */
export async function resolveVidSrc(
  request: ResolveRequest,
  context: AdapterContext
): Promise<PlaybackOffer> {
  const data = await fetchMapping(request.aniListId, context);
  const tmdb = data.mappings?.themoviedb_id;
  if (tmdb === null || tmdb === undefined || String(tmdb).trim() === '') {
    throw new ResolverError('provider_unavailable');
  }

  const episode = findEpisode(data, request.episodeRef);
  if (!episode) throw new ResolverError('no_streams');

  const isMovie = String(data.mappings?.type ?? '').toUpperCase() === 'MOVIE';
  const url = buildEmbedUrl(String(tmdb), isMovie, episode.season, episode.episode);

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? data.mappings?.mal_id ?? null,
    episodeRef: request.episodeRef,
    providerId: 'vidsrc',
    rightsStatus: 'unknown',
    browserSupport: 'supported',
    streams: [],
    subtitles: [],
    embed: {
      url,
      providerId: 'vidsrc',
      kind: 'player',
      supportsProgress: false,
    },
  };
}
