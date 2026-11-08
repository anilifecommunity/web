import type { AdapterContext, PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { anizipImdb, anizipTmdb, fetchAniZip, findAniZipEpisode } from './anizip';

export type AggregatorId = 'vidlink' | 'vidfast' | '2embed';

type Builder = (tmdb: string, movie: boolean, season: number, episode: number) => string;

const BUILDERS: Record<AggregatorId, Builder> = {
  vidlink: (tmdb, movie, season, episode) =>
    movie
      ? `https://vidlink.pro/movie/${encodeURIComponent(tmdb)}`
      : `https://vidlink.pro/tv/${encodeURIComponent(tmdb)}/${season}/${episode}`,
  vidfast: (tmdb, movie, season, episode) =>
    movie
      ? `https://vidfast.vc/movie/${encodeURIComponent(tmdb)}`
      : `https://vidfast.vc/tv/${encodeURIComponent(tmdb)}/${season}/${episode}`,
  '2embed': (tmdb, movie, season, episode) =>
    movie
      ? `https://www.2embed.skin/embed/${encodeURIComponent(tmdb)}`
      : `https://www.2embed.skin/embedtv/${encodeURIComponent(tmdb)}&s=${season}&e=${episode}`,
};

export function buildAggregatorUrl(
  providerId: AggregatorId,
  tmdb: string,
  movie: boolean,
  season: number,
  episode: number
): string {
  return BUILDERS[providerId](tmdb, movie, season, episode);
}

/**
 * VidSrc-style embed aggregators accept a TMDB id rather than an anime slug. AniZip supplies the
 * TMDB mapping; the browser loads the provider player directly. These are separate fallback
 * servers, never the default.
 */
export async function resolveEmbedAggregator(
  providerId: AggregatorId,
  request: ResolveRequest,
  context: AdapterContext
): Promise<PlaybackOffer> {
  const data = await fetchAniZip(request.aniListId, context);
  const tmdb = anizipTmdb(data);
  const imdb = anizipImdb(data);
  const id = providerId === '2embed' ? imdb ?? tmdb : tmdb;
  if (!id) throw new ResolverError('provider_unavailable');

  const episode = findAniZipEpisode(data, request.episodeRef);
  if (!episode) throw new ResolverError('no_streams');

  const isMovie = String(data.mappings?.type ?? '').toUpperCase() === 'MOVIE';
  const url = buildAggregatorUrl(providerId, id, isMovie, episode.season, episode.episode);

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? data.mappings?.mal_id ?? null,
    episodeRef: request.episodeRef,
    providerId,
    rightsStatus: 'unknown',
    browserSupport: 'supported',
    streams: [],
    subtitles: [],
    embed: {
      url,
      providerId,
      kind: 'player',
      supportsProgress: false,
    },
  };
}
