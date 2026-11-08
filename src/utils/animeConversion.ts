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

  const totalEpisodes = m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) : m.episodes;
  const availableEpisodes = status === 'Not Yet Aired' ? 0 : Math.min(24, Math.max(0, totalEpisodes ?? 12));

  const episodes: Episode[] = Array.from({ length: availableEpisodes }, (_, i) => ({
    id: `${m.id}-ep-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}`,
    durationSec: (m.duration || 24) * 60,
    thumbnail: banner || poster || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop',
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
    score: m.averageScore || 75,
    format: (m.format as Anime['format']) || 'TV',
    year: m.seasonYear || 2024,
    status,
    nextEpisode: m.nextAiringEpisode
      ? { number: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt }
      : undefined,
    durationMins: m.duration || 24,
    genres: m.genres && m.genres.length > 0 ? m.genres : ['Action', 'Fantasy'],
    synopsis: m.description ? htmlToText(m.description) : 'No synopsis available.',
    studio: m.studios?.nodes?.[0]?.name || 'Animation Studio',
    startDate: m.seasonYear ? `${m.season || 'Fall'} ${m.seasonYear}` : '2024',
    seasonName: m.season || 'Fall',
    membersCount: m.popularity || 85000,
    trailerUrl: '',
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: `${m.id}-s1`,
        number: 1,
        title: 'Season 1',
        year: m.seasonYear || 2024,
        episodes
      }
    ],
    related: []
  };
}
