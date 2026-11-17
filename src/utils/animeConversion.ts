import type { AniListMedia } from './anilistApi';
import type { Anime, Episode, RelatedManga } from '../types/anime';
import { htmlToText } from './text';
import type { MediaIndexCompactRow, MediaIndexMediaRecord } from './mediaIndexRelease';

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

function animeFormat(format?: string | null): Anime['format'] {
  return ({
    TV: 'TV',
    TV_SHORT: 'TV',
    MOVIE: 'Movie',
    ONA: 'ONA',
    OVA: 'OVA',
    SPECIAL: 'Special',
    MUSIC: 'Special',
  } as Record<string, Anime['format']>)[format || ''] || 'Unknown';
}

function animeStatus(status?: string | null): Anime['status'] {
  if (status === 'FINISHED' || status === 'CANCELLED') return 'Finished';
  if (status === 'NOT_YET_RELEASED') return 'Not Yet Aired';
  return 'Releasing';
}

function placeholderEpisodes(
  id: number,
  status: Anime['status'],
  declared: number | null | undefined,
  durationMins: number,
  image: string,
  nextEpisode?: number,
): Episode[] {
  const count = status === 'Not Yet Aired'
    ? 0
    : nextEpisode
      ? Math.max(0, nextEpisode - 1)
      : status === 'Finished'
        ? Math.max(0, declared ?? 0)
        : 0;
  return Array.from({ length: count }, (_, index) => ({
    id: `${id}-ep-${index + 1}`,
    number: index + 1,
    title: `Episode ${index + 1}`,
    durationSec: durationMins * 60,
    thumbnail: image,
    videoUrl: '',
  }));
}

export function convertMediaIndexCompactToAnime(row: MediaIndexCompactRow): Anime {
  const status = animeStatus(row.status);
  const poster = row.poster?.url || '';
  return {
    id: String(row.anilistId),
    anilistId: row.anilistId,
    title: row.titles.display || row.titles.romaji || row.titles.english || row.titles.native || 'Untitled Anime',
    englishTitle: row.titles.english || undefined,
    romajiTitle: row.titles.romaji || undefined,
    nativeTitle: row.titles.native || undefined,
    alternativeTitles: [],
    isAdult: row.visibility !== 'general',
    bannerImage: poster,
    posterImage: poster,
    score: row.score ?? 0,
    format: animeFormat(row.format),
    year: row.year ?? 0,
    status,
    durationMins: 0,
    genres: row.genres,
    synopsis: 'Details are available when you open this title.',
    studio: '',
    startDate: row.year ? String(row.year) : '',
    seasonName: '',
    membersCount: row.popularity ?? 0,
    hasDub: false,
    hasSub: false,
    seasons: [{
      id: `${row.anilistId}-s1`,
      number: 1,
      title: 'Season 1',
      year: row.year ?? 0,
      episodes: placeholderEpisodes(row.anilistId, status, row.episodes, 0, poster),
    }],
    related: [],
    relatedManga: [],
  };
}

export function convertMediaIndexMediaToAnime(record: MediaIndexMediaRecord): Anime {
  const status = animeStatus(record.status);
  const poster = record.images?.poster?.url || record.images?.banner?.url || '';
  const banner = record.images?.banner?.url || poster;
  const nextEpisode = record.nextAiringEpisode?.episode && record.nextAiringEpisode?.airingAt
    ? { number: record.nextAiringEpisode.episode, airingAt: record.nextAiringEpisode.airingAt }
    : undefined;
  const durationMins = record.durationMinutes ?? 0;
  const relatedManga: RelatedManga[] = [];
  const related: Anime['related'] = [];

  for (const edge of record.relations ?? []) {
    const node = edge.node;
    const id = Number(node?.id ?? edge.ids.anilist);
    if (!Number.isSafeInteger(id) || id <= 0 || !node) continue;
    const title = node.title?.english || node.title?.romaji || node.title?.native || edge.name || 'Untitled';
    if (edge.kind === 'MANGA') {
      relatedManga.push({
        id: String(id),
        title,
        englishTitle: node.title?.english || undefined,
        romajiTitle: node.title?.romaji || undefined,
        nativeTitle: node.title?.native || undefined,
        relationType: edge.relationType || 'OTHER',
        relationLabel: RELATION_LABELS[edge.relationType] || edge.relationType.toLowerCase().replaceAll('_', ' '),
        formatLabel: mangaFormatLabel(node.format || undefined, node.countryOfOrigin || undefined),
        description: node.description || '',
        posterImage: node.poster || '',
        siteUrl: `https://anilist.co/manga/${id}`,
        isAdult: node.isAdult === true,
      });
    } else if (edge.kind === 'ANIME') {
      related.push({
        id: String(id),
        title,
        relation: RELATION_LABELS[edge.relationType] || edge.relationType.toLowerCase().replaceAll('_', ' '),
        format: node.format || 'Unknown',
        year: 0,
        poster: node.poster || '',
        episodesCount: node.episodes ?? undefined,
        isAdult: node.isAdult ?? undefined,
      });
    }
  }

  const relatedIds = new Set(related.map((item) => item.id));
  for (const recommendation of record.recommendations ?? []) {
    const card = recommendation.card;
    const id = Number(card?.id ?? recommendation.ids.anilist);
    if (!card || !Number.isSafeInteger(id) || id <= 0 || relatedIds.has(String(id))) continue;
    relatedIds.add(String(id));
    related.push({
      id: String(id),
      title: card.title?.english || card.title?.romaji || card.title?.native || card.title?.display || 'Untitled',
      relation: 'Recommended',
      format: card.format || 'Unknown',
      year: card.seasonYear ?? 0,
      poster: card.coverImage?.extraLarge || card.coverImage?.large || '',
      episodesCount: card.episodes ?? undefined,
      isAdult: card.isAdult ?? undefined,
    });
  }

  const aliases = [...new Set([
    ...record.titles.synonyms.map((item) => item.value),
    ...(record.bangumi?.names ?? []),
  ].filter(Boolean))];
  const mangaById = new Map<string, RelatedManga>();
  for (const manga of relatedManga) {
    const existing = mangaById.get(manga.id);
    if (!existing || (manga.relationType === 'SOURCE' && existing.relationType !== 'SOURCE')) {
      mangaById.set(manga.id, manga);
    }
  }
  return {
    id: String(record.ids.anilist),
    anilistId: record.ids.anilist,
    title: record.titles.display || record.titles.romaji || record.titles.english || record.titles.native || 'Untitled Anime',
    englishTitle: record.titles.english || undefined,
    romajiTitle: record.titles.romaji || undefined,
    nativeTitle: record.titles.native || undefined,
    alternativeTitles: aliases,
    isAdult: record.visibility !== 'general',
    bannerImage: banner,
    posterImage: poster,
    score: record.score?.value ?? 0,
    format: animeFormat(record.format),
    year: record.seasonYear ?? record.startDate?.year ?? 0,
    status,
    nextEpisode,
    durationMins,
    genres: record.genres ?? [],
    synopsis: record.synopsis?.text || 'No synopsis available.',
    studio: record.studios?.find((studio) => studio.animation)?.name || record.studios?.[0]?.name || '',
    startDate: record.startDate?.year
      ? [record.startDate.year, record.startDate.month, record.startDate.day].filter(Boolean).join('-')
      : '',
    seasonName: record.season || '',
    membersCount: record.popularity ?? 0,
    trailerUrl: record.trailer?.site?.toLowerCase() === 'youtube' && record.trailer.id
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(record.trailer.id)}`
      : undefined,
    hasDub: false,
    hasSub: false,
    seasons: [{
      id: `${record.ids.anilist}-s1`,
      number: 1,
      title: 'Season 1',
      year: record.seasonYear ?? record.startDate?.year ?? 0,
      episodes: placeholderEpisodes(
        record.ids.anilist,
        status,
        record.episodes.declared,
        durationMins,
        banner || poster,
        nextEpisode?.number,
      ),
    }],
    related,
    relatedManga: [...mangaById.values()].sort((a, b) =>
      Number(b.relationType === 'SOURCE') - Number(a.relationType === 'SOURCE') || a.title.localeCompare(b.title)
    ),
  };
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
  const status = animeStatus(m.status);
  const format = animeFormat(m.format);

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
