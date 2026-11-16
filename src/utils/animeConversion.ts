import type { AniListMedia } from './anilistApi';
import type { Anime, Episode } from '../types/anime';
import { htmlToText } from './text';

export function convertAniListToAnime(m: AniListMedia): Anime {
  const title = m.title.english || m.title.romaji || m.title.native || 'Untitled Anime';
  const banner = m.bannerImage || m.coverImage.extraLarge || m.coverImage.large || '';
  const poster = m.coverImage.extraLarge || m.coverImage.large || m.coverImage.medium || '';
  const status: Anime['status'] =
    m.status === 'FINISHED' || m.status === 'CANCELLED'
      ? 'Finished'
      : m.status === 'NOT_YET_RELEASED'
        ? 'Not Yet Aired'
        : 'Releasing';
  const format: Anime['format'] = ({
    TV: 'TV',
    TV_SHORT: 'TV',
    MOVIE: 'Movie',
    ONA: 'ONA',
    OVA: 'OVA',
    SPECIAL: 'Special',
    MUSIC: 'Special',
  } as Record<string, Anime['format']>)[m.format || ''] || 'Unknown';

  const availableEpisodes =
    status === 'Not Yet Aired'
      ? 0
      : m.nextAiringEpisode
        ? Math.max(0, m.nextAiringEpisode.episode - 1)
        : status === 'Finished'
          ? Math.max(0, m.episodes ?? 0)
          : 0;

  const episodes: Episode[] = Array.from({ length: availableEpisodes }, (_, i) => ({
    id: `${m.id}-ep-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`,
    durationSec: (m.duration ?? 0) * 60,
    thumbnail: banner || poster,
    videoUrl: '',
    airedDate: undefined
  }));

  return {
    id: String(m.id),
    title,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    bannerImage: banner || poster,
    posterImage: poster || banner,
    score: m.averageScore ?? 0,
    format,
    year: m.seasonYear ?? 0,
    status,
    nextEpisode: m.nextAiringEpisode
      ? { number: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
      : undefined,
    durationMins: m.duration ?? 0,
    genres: m.genres ?? [],
    synopsis: m.description ? htmlToText(m.description) : 'No synopsis available.',
    studio: m.studios?.nodes?.[0]?.name ?? '',
    startDate: m.seasonYear ? `${m.season ? `${m.season} ` : ''}${m.seasonYear}` : '',
    seasonName: m.season ?? '',
    membersCount: m.popularity ?? 0,
    trailerUrl: '',
    hasDub: false,
    hasSub: false,
    seasons: [
      {
        id: `${m.id}-s1`,
        number: 1,
        title: 'Season 1',
        year: m.seasonYear ?? 0,
        episodes
      }
    ],
    related: []
  };
}
