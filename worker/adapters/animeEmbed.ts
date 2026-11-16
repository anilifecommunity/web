import type { PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';

export function buildAnimeEmbedUrl(aniListId: number, episodeRef: string, audio: ResolveRequest['audio']): string {
  if (audio !== 'sub' && audio !== 'dub') throw new ResolverError('audio_unavailable');
  return `https://animeembed.com/embed/ani/${aniListId}/${encodeURIComponent(episodeRef)}?track=${audio}&autoNext=0&accent=74cf66`;
}

/** AnimeEmbed publishes a fixed AniList-id iframe contract; the browser loads its player directly. */
export async function resolveAnimeEmbed(request: ResolveRequest): Promise<PlaybackOffer> {
  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? null,
    episodeRef: request.episodeRef,
    providerId: 'animeembed',
    rightsStatus: 'unknown',
    browserSupport: 'supported',
    streams: [],
    subtitles: [],
    embed: {
      url: buildAnimeEmbedUrl(request.aniListId, request.episodeRef, request.audio),
      providerId: 'animeembed',
      kind: 'player',
      supportsProgress: true,
    },
  };
}
