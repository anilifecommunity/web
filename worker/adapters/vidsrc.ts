import type { AdapterContext, PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { anizipTmdb, fetchAniZip, findAniZipEpisode } from './anizip';

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

export async function resolveVidSrc(
  request: ResolveRequest,
  context: AdapterContext
): Promise<PlaybackOffer> {
  const data = await fetchAniZip(request.aniListId, context);
  const tmdb = anizipTmdb(data);
  if (!tmdb) throw new ResolverError('provider_unavailable');

  const episode = findAniZipEpisode(data, request.episodeRef);
  if (!episode) throw new ResolverError('no_streams');

  const isMovie = String(data.mappings?.type ?? '').toUpperCase() === 'MOVIE';
  const url = buildEmbedUrl(tmdb, isMovie, episode.season, episode.episode);

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
