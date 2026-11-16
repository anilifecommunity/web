import type { AdapterContext, PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { fetchAniListTitles } from '../anilist';

export function buildZokoUrl(malId: number, episodeRef: string, audio: ResolveRequest['audio'], variant?: ResolveRequest['variant']): string {
  if (audio !== 'sub' && audio !== 'dub') throw new ResolverError('audio_unavailable');
  const track = audio === 'dub' ? 'dub' : variant === 'hard' ? 'hsub' : 'sub';
  return `https://zokoanime.video/stream/mal/${malId}/${encodeURIComponent(episodeRef)}/${track}?color=74cf66`;
}

/** Zoko publishes a first-party iframe API; AniList metadata supplies its required MAL id. */
export async function resolveZoko(request: ResolveRequest, context: AdapterContext): Promise<PlaybackOffer> {
  const malId = request.malId ?? (await fetchAniListTitles(request.aniListId, context.timeoutMs, context.signal))?.malId;
  if (!malId) throw new ResolverError('provider_unavailable');

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId,
    episodeRef: request.episodeRef,
    providerId: 'zoko',
    rightsStatus: 'unknown',
    browserSupport: 'supported',
    streams: [],
    subtitles: [],
    embed: {
      url: buildZokoUrl(malId, request.episodeRef, request.audio, request.variant),
      providerId: 'zoko',
      kind: 'player',
      supportsProgress: true,
    },
  };
}
