import type { AniListMedia } from './anilistApi';
import type { Anime, Episode, RelatedManga } from '../types/anime';
import { htmlToText } from './text';

const RELATION_LABELS: Record<string, string> = {
  SOURCE: 'Source material',
  ADAPTATION: 'Adaptation',
  SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Parent story',
  SEQUEL: 'Sequel',
  PREQUEL: 'Prequel',
  ALTERNATIVE: 'Alternative version',
  CHARACTER: 'Shared characters',
  OTHER: 'Related work',
};

function mangaFormatLabel(format?: string, country?: string): string {
  if (format === 'ONE_SHOT') return 'One-shot';
  if (format === 'NOVEL') return 'Light novel';
  if (format === 'MANGA' && country === 'KR') return 'Manhwa';
  if (format === 'MANGA' && country === 'CN') return 'Manhua';
  if (format === 'MANGA') return 'Manga';
  return format ? format.toLowerCase().replaceAll('_', ' ') : 'Comic';
}

export function convertAniListRelatedManga(m: AniListMedia, hideAdultContent = false): RelatedManga[] {
  const byId = new Map<string, RelatedManga>();
  for (const edge of m.relations?.edges ?? []) {
    const node = edge.node;
    if (!node || node.type !== 'MANGA' || (hideAdultContent && node.isAdult === true)) continue;
    const id = String(node.id);
    if (!/^\d+$/.test(id)) continue;
    const relationType = edge.relationType || 'OTHER';
    const manga: RelatedManga = {
      id,
      title: node.title.english || node.title.romaji || node.title.native || 'Untitled manga',
      englishTitle: node.title.english,
      romajiTitle: node.title.romaji,
      nativeTitle: node.title.native,
      relationType,
      relationLabel: RELATION_LABELS[relationType] || relationType.toLowerCase().replaceAll('_', ' '),
      formatLabel: mangaFormatLabel(node.format, node.countryOfOrigin),
      description: node.description ? htmlToText(node.description) : '',
      posterImage: node.coverImage.extraLarge || node.coverImage.large || node.coverImage.medium || '',
      siteUrl: `https://anilist.co/manga/${id}`,
      isAdult: node.isAdult === true,
    };
    const existing = byId.get(id);
    if (!existing || (relationType === 'SOURCE' && existing.relationType !== 'SOURCE')) byId.set(id, manga);
  }
  return [...byId.values()].sort((a, b) =>
    Number(b.relationType === 'SOURCE') - Number(a.relationType === 'SOURCE') || a.title.localeCompare(b.title)
  );
}

export function mergeAniListSearchResults(
  animeResults: AniListMedia[],
  mangaResults: AniListMedia[]
): AniListMedia[] {
  const merged = new Map(animeResults.map((anime) => [anime.id, anime]));
  for (const manga of mangaResults) {
    for (const edge of manga.relations?.edges ?? []) {
      const related = edge.node;
      if (related?.type === 'ANIME' && !merged.has(related.id)) merged.set(related.id, related);
    }
  }
  return [...merged.values()];
}

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
    englishTitle: m.title.english,
    romajiTitle: m.title.romaji,
    nativeTitle: m.title.native,
    alternativeTitles: m.synonyms ?? [],
    isAdult: m.isAdult === true,
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
    related: [],
    relatedManga: convertAniListRelatedManga(m),
  };
}
