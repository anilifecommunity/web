import { readJsonCapped, safeFetch } from './guards';

const GRAPHQL = 'https://graphql.anilist.co';
const HOSTS = new Set(['graphql.anilist.co']);
const MAX_JSON = 131_072;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

export interface AniListTitles {
  english?: string;
  romaji?: string;
  native?: string;
}

interface CachedTitles {
  titles: AniListTitles;
  malId: number | null;
  fetchedAt: number;
}

const cache = new Map<number, CachedTitles>();
const availabilityCache = new Map<number, { availableBefore: number; finishedEpisodes: number; fetchedAt: number }>();

const QUERY = `query ($id: Int) {
  Media(id: $id) {
    idMal
    title { english romaji native }
  }
}`;

const AVAILABILITY_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    status
    episodes
    nextAiringEpisode { episode airingAt }
  }
}`;

export async function isAniListEpisodeAvailable(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<boolean> {
  const cached = availabilityCache.get(aniListId);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return episode < cached.availableBefore || (cached.finishedEpisodes > 0 && episode <= cached.finishedEpisodes);
  }
  const response = await safeFetch(
    GRAPHQL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: AVAILABILITY_QUERY, variables: { id: aniListId } }),
    },
    { allowedHosts: HOSTS, timeoutMs, maxBytes: MAX_JSON }
  );
  if (!response.ok) return false;
  const data = (await readJsonCapped(response, MAX_JSON)) as {
    data?: {
      Media?: {
        status?: string;
        episodes?: number | null;
        nextAiringEpisode?: { episode?: number; airingAt?: number } | null;
      };
    };
  };
  const media = data?.data?.Media;
  if (!media || media.status === 'NOT_YET_RELEASED' || media.status === 'CANCELLED') return false;
  const nextEpisode = media.nextAiringEpisode?.episode;
  const availableBefore = Number.isSafeInteger(nextEpisode) ? Number(nextEpisode) : 0;
  const finishedEpisodes = media.status === 'FINISHED' && Number.isSafeInteger(media.episodes)
    ? Number(media.episodes)
    : 0;
  availabilityCache.set(aniListId, { availableBefore, finishedEpisodes, fetchedAt: Date.now() });
  return episode < availableBefore || (finishedEpisodes > 0 && episode <= finishedEpisodes);
}

/**
 * Reads the three canonical titles and the MAL id for a media id.
 *
 * This is public AniList metadata, fetched server-side only so a provider's literal title search
 * has something to search for. It never carries a viewer token.
 */
export async function fetchAniListTitles(
  aniListId: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ titles: AniListTitles; malId: number | null } | null> {
  const cached = cache.get(aniListId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { titles: cached.titles, malId: cached.malId };
  }

  const response = await safeFetch(
    GRAPHQL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { id: aniListId } }),
      signal,
    },
    { allowedHosts: HOSTS, timeoutMs, maxBytes: MAX_JSON }
  );

  if (!response.ok) return null;
  const data = (await readJsonCapped(response, MAX_JSON)) as {
    data?: { Media?: { idMal?: number | null; title?: AniListTitles } };
  };
  const media = data?.data?.Media;
  if (!media || !media.title) return null;

  const titles: AniListTitles = {
    english: media.title.english ?? undefined,
    romaji: media.title.romaji ?? undefined,
    native: media.title.native ?? undefined,
  };
  const malId = typeof media.idMal === 'number' ? media.idMal : null;

  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(aniListId, { titles, malId, fetchedAt: Date.now() });

  return { titles, malId };
}

export function resetAniListCache(): void {
  cache.clear();
  availabilityCache.clear();
}
