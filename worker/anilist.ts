import { readJsonCapped, safeFetch } from './guards';

const GRAPHQL = 'https://graphql.anilist.co';
const HOSTS = new Set(['graphql.anilist.co']);
const MEDIA_INDEX = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/data';
const MEDIA_INDEX_HOSTS = new Set(['cdn.jsdelivr.net']);
const ANIZIP = 'https://api.ani.zip';
const ANIZIP_HOSTS = new Set(['api.ani.zip']);
const SHIKIMORI = 'https://shikimori.one/api/animes';
const SHIKIMORI_HOSTS = new Set(['shikimori.one']);
const MAX_JSON = 131_072;
const MAX_MEDIA_INDEX_JSON = 1 * 1024 * 1024;
const MAX_ANIZIP_JSON = 3 * 1024 * 1024;
const MAX_FALLBACK_JSON = 65_536;
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
interface CachedAvailability {
  availableBefore: number;
  finishedEpisodes: number;
  known: boolean;
  fetchedAt: number;
}

export type EpisodeAvailability = 'available' | 'unavailable' | 'unknown';

const availabilityCache = new Map<number, CachedAvailability>();

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

async function mediaIndexAvailableBefore(
  aniListId: number,
  timeoutMs: number,
  now = Date.now()
): Promise<number | null> {
  try {
    const shard = Math.floor(aniListId / 1000);
    const response = await safeFetch(
      `${MEDIA_INDEX}/anime/${shard}/${aniListId}/episodes.json`,
      { headers: { Accept: 'application/json' } },
      { allowedHosts: MEDIA_INDEX_HOSTS, timeoutMs, maxBytes: MAX_MEDIA_INDEX_JSON }
    );
    if (!response.ok) return null;
    const episodes = await readJsonCapped(response, MAX_MEDIA_INDEX_JSON) as Array<{
      number?: number;
      airDate?: string;
      air_date?: string;
    }>;
    if (!Array.isArray(episodes)) return null;
    let latest = 0;
    let hasDatedEpisode = false;
    for (const entry of episodes) {
      const airDate = entry.airDate ?? entry.air_date;
      const airedAt = typeof airDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(airDate)
        ? Date.parse(`${airDate}T00:00:00Z`)
        : Number.NaN;
      if (Number.isSafeInteger(entry.number) && Number.isFinite(airedAt)) hasDatedEpisode = true;
      if (Number.isSafeInteger(entry.number) && entry.number! > latest && airedAt <= now) {
        latest = entry.number!;
      }
    }
    return hasDatedEpisode ? latest + 1 : null;
  } catch {
    return null;
  }
}

async function fallbackCatalogueAvailability(
  aniListId: number,
  timeoutMs: number,
  now = Date.now()
): Promise<CachedAvailability | null> {
  try {
    const mappingResponse = await safeFetch(
      `${ANIZIP}/mappings?anilist_id=${aniListId}`,
      { headers: { Accept: 'application/json' } },
      { allowedHosts: ANIZIP_HOSTS, timeoutMs, maxBytes: MAX_ANIZIP_JSON }
    );
    if (!mappingResponse.ok) return null;
    const mapping = await readJsonCapped(mappingResponse, MAX_ANIZIP_JSON) as {
      mappings?: { mal_id?: number | null };
    };
    const malId = mapping?.mappings?.mal_id;
    if (!Number.isSafeInteger(malId) || Number(malId) < 1) return null;

    const catalogueResponse = await safeFetch(
      `${SHIKIMORI}/${malId}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Anilife-Web (https://anilife.cc)',
        },
      },
      { allowedHosts: SHIKIMORI_HOSTS, timeoutMs, maxBytes: MAX_FALLBACK_JSON }
    );
    if (!catalogueResponse.ok) return null;
    const metadata = await readJsonCapped(catalogueResponse, MAX_FALLBACK_JSON) as {
      status?: string;
      episodes?: number | null;
      episodes_aired?: number | null;
      aired_on?: string | null;
      released_on?: string | null;
    };
    const status = metadata.status?.toLowerCase();
    const airedOn = metadata.aired_on && /^\d{4}-\d{2}-\d{2}$/.test(metadata.aired_on)
      ? Date.parse(`${metadata.aired_on}T00:00:00Z`)
      : Number.NaN;
    if (Number.isFinite(airedOn) && airedOn > now) {
      return { availableBefore: 1, finishedEpisodes: 0, known: true, fetchedAt: Date.now() };
    }
    if (status === 'released' && Number.isSafeInteger(metadata.episodes) && Number(metadata.episodes) > 0) {
      const releasedOn = metadata.released_on && /^\d{4}-\d{2}-\d{2}$/.test(metadata.released_on)
        ? Date.parse(`${metadata.released_on}T00:00:00Z`)
        : Number.NaN;
      if (!Number.isFinite(releasedOn) || releasedOn <= now) {
        return {
          availableBefore: 0,
          finishedEpisodes: Number(metadata.episodes),
          known: true,
          fetchedAt: Date.now(),
        };
      }
    }
    if (Number.isSafeInteger(metadata.episodes_aired) && Number(metadata.episodes_aired) > 0) {
      return {
        availableBefore: Number(metadata.episodes_aired) + 1,
        finishedEpisodes: 0,
        known: true,
        fetchedAt: Date.now(),
      };
    }
    if (status === 'anons') {
      return { availableBefore: 1, finishedEpisodes: 0, known: true, fetchedAt: Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}

function availabilityResult(cached: CachedAvailability, episode: number): EpisodeAvailability {
  if (episode < cached.availableBefore || (cached.finishedEpisodes > 0 && episode <= cached.finishedEpisodes)) {
    return 'available';
  }
  return cached.known ? 'unavailable' : 'unknown';
}

async function fallbackAvailability(
  aniListId: number,
  timeoutMs: number
): Promise<CachedAvailability> {
  const availableBefore = await mediaIndexAvailableBefore(aniListId, timeoutMs);
  if (availableBefore !== null) {
    return { availableBefore, finishedEpisodes: 0, known: true, fetchedAt: Date.now() };
  }
  return await fallbackCatalogueAvailability(aniListId, timeoutMs) ?? {
    availableBefore: 0,
    finishedEpisodes: 0,
    known: false,
    fetchedAt: Date.now(),
  };
}

export async function getAniListEpisodeAvailability(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<EpisodeAvailability> {
  const cached = availabilityCache.get(aniListId);
  const cacheTtl = cached?.known ? 5 * 60 * 1000 : 30 * 1000;
  if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
    return availabilityResult(cached, episode);
  }
  let response: Response | null = null;
  try {
    response = await safeFetch(
      GRAPHQL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: AVAILABILITY_QUERY, variables: { id: aniListId } }),
      },
      { allowedHosts: HOSTS, timeoutMs, maxBytes: MAX_JSON }
    );
  } catch {}
  if (!response?.ok) {
    const fallback = await fallbackAvailability(aniListId, timeoutMs);
    availabilityCache.set(aniListId, fallback);
    return availabilityResult(fallback, episode);
  }
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
  if (!media) {
    const fallback = await fallbackAvailability(aniListId, timeoutMs);
    availabilityCache.set(aniListId, fallback);
    return availabilityResult(fallback, episode);
  }
  if (media.status === 'NOT_YET_RELEASED' || media.status === 'CANCELLED') {
    const unavailable = { availableBefore: 1, finishedEpisodes: 0, known: true, fetchedAt: Date.now() };
    availabilityCache.set(aniListId, unavailable);
    return 'unavailable';
  }
  const nextEpisode = media.nextAiringEpisode?.episode;
  const availableBefore = Number.isSafeInteger(nextEpisode) ? Number(nextEpisode) : 0;
  const finishedEpisodes = media.status === 'FINISHED' && Number.isSafeInteger(media.episodes)
    ? Number(media.episodes)
    : 0;
  if (availableBefore === 0 && finishedEpisodes === 0) {
    const fallback = await fallbackAvailability(aniListId, timeoutMs);
    availabilityCache.set(aniListId, fallback);
    return availabilityResult(fallback, episode);
  }
  const resolved = { availableBefore, finishedEpisodes, known: true, fetchedAt: Date.now() };
  availabilityCache.set(aniListId, resolved);
  return availabilityResult(resolved, episode);
}

export async function isAniListEpisodeAvailable(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<boolean> {
  return await getAniListEpisodeAvailability(aniListId, episode, timeoutMs) === 'available';
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
