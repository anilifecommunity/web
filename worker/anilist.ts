import { readJsonCapped, safeFetch } from './guards';
import {
  fetchVerifiedMediaIndexEpisodes,
  fetchVerifiedMediaIndexMedia,
  resetMediaIndexV1Cache,
} from './mediaIndexV1';

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
export type EpisodeAvailability = 'available' | 'unavailable' | 'unknown';

interface CachedEpisodeAvailability {
  result: EpisodeAvailability;
  fetchedAt: number;
}

const availabilityCache = new Map<string, CachedEpisodeAvailability>();
const availabilityInFlight = new Map<string, Promise<EpisodeAvailability>>();

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

function datedEpisodeAvailability(
  entries: Array<{ number?: number; airDate?: string | null; air_date?: string | null }>,
  episode: number,
  now: number,
): EpisodeAvailability | null {
  const exact = entries.find((entry) => entry.number === episode);
  if (!exact) return null;
  const airDate = exact.airDate ?? exact.air_date;
  const airedAt = typeof airDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(airDate)
    ? Date.parse(`${airDate}T00:00:00Z`)
    : Number.NaN;
  if (!Number.isFinite(airedAt)) return null;
  return airedAt <= now ? 'available' : 'unavailable';
}

function datePartsUtc(value: { year?: number | null; month?: number | null; day?: number | null } | null | undefined): number {
  if (!value || !Number.isSafeInteger(value.year)) return Number.NaN;
  return Date.UTC(Number(value.year), Math.max(0, Number(value.month ?? 1) - 1), Number(value.day ?? 1));
}

async function mediaIndexEpisodeAvailability(
  aniListId: number,
  episode: number,
  timeoutMs: number,
  now = Date.now()
): Promise<EpisodeAvailability | null> {
  const verified = await fetchVerifiedMediaIndexEpisodes(aniListId, timeoutMs);
  if (verified?.availability === 'AVAILABLE') {
    const exact = datedEpisodeAvailability(verified.episodes, episode, now);
    if (exact) return exact;
  }

  const verifiedMedia = await fetchVerifiedMediaIndexMedia(aniListId, timeoutMs);
  if (verifiedMedia) {
    if (verifiedMedia.status === 'NOT_YET_RELEASED' || verifiedMedia.status === 'CANCELLED') return 'unavailable';
    const startAt = datePartsUtc(verifiedMedia.startDate);
    if (Number.isFinite(startAt) && startAt > now) return 'unavailable';
    const nextEpisode = verifiedMedia.nextAiringEpisode?.episode;
    if (Number.isSafeInteger(nextEpisode) && Number(nextEpisode) > 0) {
      return episode < Number(nextEpisode) ? 'available' : 'unavailable';
    }
    const declared = verifiedMedia.episodes?.declared;
    if (verifiedMedia.status === 'FINISHED' && Number.isSafeInteger(declared) && Number(declared) > 0) {
      return episode <= Number(declared) ? 'available' : 'unavailable';
    }
  }

  try {
    const shard = Math.floor(aniListId / 1000);
    const response = await safeFetch(
      `${MEDIA_INDEX}/anime/${shard}/${aniListId}/episodes.json`,
      { headers: { Accept: 'application/json' } },
      { allowedHosts: MEDIA_INDEX_HOSTS, timeoutMs, maxBytes: MAX_MEDIA_INDEX_JSON }
    );
    if (response.ok) {
      const episodes = await readJsonCapped(response, MAX_MEDIA_INDEX_JSON) as Array<{
        number?: number;
        airDate?: string;
        air_date?: string;
      }>;
      if (Array.isArray(episodes)) {
        const exact = datedEpisodeAvailability(episodes, episode, now);
        if (exact) return exact;
      }
    }
  } catch {
    // The title-level compatibility record below may still prove a finished one-off.
  }

  try {
    const shard = Math.floor(aniListId / 1000);
    const response = await safeFetch(
      `${MEDIA_INDEX}/anime/${shard}/${aniListId}/index.json`,
      { headers: { Accept: 'application/json' } },
      { allowedHosts: MEDIA_INDEX_HOSTS, timeoutMs, maxBytes: MAX_JSON }
    );
    if (!response.ok) return null;
    const media = await readJsonCapped(response, MAX_JSON) as {
      status?: string;
      episodes?: number | null;
      startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
    };
    const startAt = datePartsUtc(media.startDate);
    if (Number.isFinite(startAt) && startAt > now) return 'unavailable';
    if (media.status === 'NOT_YET_RELEASED' || media.status === 'CANCELLED') return 'unavailable';
    if (media.status === 'FINISHED' && Number.isSafeInteger(media.episodes) && Number(media.episodes) > 0) {
      return episode <= Number(media.episodes) ? 'available' : 'unavailable';
    }
  } catch {}
  return null;
}

interface RangeAvailability {
  availableBefore: number;
  finishedEpisodes: number;
  known: boolean;
}

async function fallbackCatalogueAvailability(
  aniListId: number,
  timeoutMs: number,
  now = Date.now()
): Promise<RangeAvailability | null> {
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
      return { availableBefore: 1, finishedEpisodes: 0, known: true };
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
        };
      }
    }
    if (Number.isSafeInteger(metadata.episodes_aired) && Number(metadata.episodes_aired) > 0) {
      return {
        availableBefore: Number(metadata.episodes_aired) + 1,
        finishedEpisodes: 0,
        known: true,
      };
    }
    if (status === 'anons') {
      return { availableBefore: 1, finishedEpisodes: 0, known: true };
    }
    return null;
  } catch {
    return null;
  }
}

function availabilityResult(cached: RangeAvailability, episode: number): EpisodeAvailability {
  if (episode < cached.availableBefore || (cached.finishedEpisodes > 0 && episode <= cached.finishedEpisodes)) {
    return 'available';
  }
  return cached.known ? 'unavailable' : 'unknown';
}

async function fallbackAvailability(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<EpisodeAvailability> {
  const indexed = await mediaIndexEpisodeAvailability(aniListId, episode, timeoutMs);
  if (indexed) return indexed;
  const catalogue = await fallbackCatalogueAvailability(aniListId, timeoutMs);
  return catalogue ? availabilityResult(catalogue, episode) : 'unknown';
}

async function resolveEpisodeAvailability(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<EpisodeAvailability> {
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
    return fallbackAvailability(aniListId, episode, timeoutMs);
  }
  let data: {
    data?: {
      Media?: {
        status?: string;
        episodes?: number | null;
        nextAiringEpisode?: { episode?: number; airingAt?: number } | null;
      };
    };
  };
  try {
    data = (await readJsonCapped(response, MAX_JSON)) as typeof data;
  } catch {
    return fallbackAvailability(aniListId, episode, timeoutMs);
  }
  const media = data?.data?.Media;
  if (!media) {
    return fallbackAvailability(aniListId, episode, timeoutMs);
  }
  if (media.status === 'NOT_YET_RELEASED' || media.status === 'CANCELLED') {
    return 'unavailable';
  }
  const nextEpisode = media.nextAiringEpisode?.episode;
  const availableBefore = Number.isSafeInteger(nextEpisode) ? Number(nextEpisode) : 0;
  const finishedEpisodes = media.status === 'FINISHED' && Number.isSafeInteger(media.episodes)
    ? Number(media.episodes)
    : 0;
  if (availableBefore === 0 && finishedEpisodes === 0) {
    return fallbackAvailability(aniListId, episode, timeoutMs);
  }
  return availabilityResult({ availableBefore, finishedEpisodes, known: true }, episode);
}

export async function getAniListEpisodeAvailability(
  aniListId: number,
  episode: number,
  timeoutMs: number
): Promise<EpisodeAvailability> {
  const key = `${aniListId}:${episode}`;
  const cached = availabilityCache.get(key);
  const cacheTtl = cached?.result === 'unknown' ? 30 * 1000 : 5 * 60 * 1000;
  if (cached && Date.now() - cached.fetchedAt < cacheTtl) return cached.result;

  const existing = availabilityInFlight.get(key);
  if (existing) return existing;
  const pending = resolveEpisodeAvailability(aniListId, episode, timeoutMs)
    .then((result) => {
      if (availabilityCache.size >= MAX_ENTRIES) {
        const oldest = availabilityCache.keys().next().value as string | undefined;
        if (oldest) availabilityCache.delete(oldest);
      }
      availabilityCache.set(key, { result, fetchedAt: Date.now() });
      return result;
    })
    .finally(() => availabilityInFlight.delete(key));
  availabilityInFlight.set(key, pending);
  return pending;
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

  let resolved: { titles: AniListTitles; malId: number | null } | null = null;
  try {
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
    if (response.ok) {
      const data = (await readJsonCapped(response, MAX_JSON)) as {
        data?: { Media?: { idMal?: number | null; title?: AniListTitles } };
      };
      const media = data?.data?.Media;
      if (media?.title) {
        resolved = {
          titles: {
            english: media.title.english ?? undefined,
            romaji: media.title.romaji ?? undefined,
            native: media.title.native ?? undefined,
          },
          malId: typeof media.idMal === 'number' ? media.idMal : null,
        };
      }
    }
  } catch {}

  if (!resolved) {
    const indexed = await fetchVerifiedMediaIndexMedia(aniListId, timeoutMs);
    if (indexed) {
      resolved = {
        titles: {
          english: indexed.titles.english ?? undefined,
          romaji: indexed.titles.romaji ?? undefined,
          native: indexed.titles.native ?? undefined,
        },
        malId: typeof indexed.ids.mal === 'number' ? indexed.ids.mal : null,
      };
    }
  }
  if (!resolved) return null;

  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(aniListId, { titles: resolved.titles, malId: resolved.malId, fetchedAt: Date.now() });

  return resolved;
}

export function resetAniListCache(): void {
  cache.clear();
  availabilityCache.clear();
  availabilityInFlight.clear();
  resetMediaIndexV1Cache();
}
