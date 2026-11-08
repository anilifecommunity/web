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

const QUERY = `query ($id: Int) {
  Media(id: $id) {
    idMal
    title { english romaji native }
  }
}`;

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
}
