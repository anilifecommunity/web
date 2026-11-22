




import {
  AniListRequestError,
  buildAniListOAuthUrl,
  createOAuthState,
  savePendingOAuthState,
} from './oauth';
import { STORAGE_KEYS } from '../data/keys';
import { mergeAniListSearchResults } from './animeConversion';

export { clearOAuthToken, isAniListAuthError, loadOAuthToken, saveOAuthToken } from './oauth';

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

/**
 * Public AniList application id, supplied at build time.
 *
 * The web client uses AniList's implicit grant: the token arrives in the redirect
 * fragment, so no client secret exists anywhere in this repository, the bundle or a
 * server. An empty value disables AniList sign-in instead of falling back to a
 * historical shared client.
 */
export const ANILIST_CLIENT_ID = String(
  (import.meta.env?.VITE_ANILIST_CLIENT_ID as string | undefined) ?? ''
).trim();

const ANILIST_TIMEOUT_MS = 12_000;

async function fetchAniList(requestInit: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);
  try {
    return await fetch(ANILIST_ENDPOINT, { ...requestInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function retryDelayMs(response?: Response): number {
  const retryAfter = response?.headers.get('Retry-After');
  if (!retryAfter) return 250;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.min(2_000, Math.max(0, seconds * 1000));
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.min(2_000, Math.max(0, date - Date.now())) : 250;
}

export interface AniListMedia {
  id: number;
  isAdult?: boolean;
  type?: 'ANIME' | 'MANGA';
  siteUrl?: string;
  countryOfOrigin?: string;
  title: {
    english?: string;
    romaji?: string;
    native?: string;
  };
  synonyms?: string[];
  coverImage: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    color?: string;
  };
  bannerImage?: string;
  description?: string;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  format?: string;
  episodes?: number;
  status?: string;
  seasonYear?: number;
  season?: string;
  genres?: string[];
  duration?: number;
  source?: string;
  studios?: {
    nodes: Array<{ name: string }>;
  };
  trailer?: {
    id: string;
    site: string;
  };
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  };
  relations?: {
    edges: Array<{
      relationType?: string;
      node?: AniListMedia;
    }>;
  };
}

export interface AniListUserStats {
  count: number;
  episodesWatched: number;
  minutesWatched: number;
  meanScore: number;
  standardDeviation?: number;
}

export interface AniListUserData {
  id: number;
  name: string;
  avatar: {
    large: string;
    medium: string;
  };
  bannerImage?: string;
  about?: string;
  statistics?: {
    anime?: AniListUserStats;
  };
}

export interface AniListListEntry {
  id: number;
  status: string;
  score: number;
  progress: number;
  updatedAt: number;
  media: AniListMedia;
}

export interface AniListUserCollection {
  user: AniListUserData;
  lists: Array<{
    name: string;
    status?: string;
    isCustomList: boolean;
    entries: AniListListEntry[];
  }>;
}

export interface AiringScheduleItem {
  id: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
  media: AniListMedia;
}




export async function queryAniList<T>(
  query: string,
  variables: Record<string, any> = {},
  token?: string | null
): Promise<T> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  };

  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchAniList(requestInit);
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response)));
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      response = undefined;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs()));
        continue;
      }
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error('AniList request failed');

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    let authFailure = response.status === 401 || response.status === 403;
    try {
      const errJson = (await response.json()) as { errors?: Array<{ message?: string }> };
      const message = errJson.errors?.[0]?.message;
      if (message) {
        detail = message;
        authFailure = authFailure || /invalid token|unauthorized/i.test(message);
      }
    } catch {}
    throw new AniListRequestError(
      authFailure ? detail : `AniList error: ${detail}`,
      response.status || 500,
    );
  }

  const json = (await response.json()) as { data: T; errors?: Array<{ message?: string }> };
  if (json.errors && json.errors.length > 0) {
    const message = json.errors[0].message || 'AniList query error';
    if (/invalid token|unauthorized/i.test(message)) {
      throw new AniListRequestError(message, 401);
    }
    throw new Error(message);
  }

  return json.data;
}




export function getAniListOAuthUrl(): string {
  if (!ANILIST_CLIENT_ID) {
    throw new Error('AniList sign-in is not configured');
  }
  const state = createOAuthState();
  savePendingOAuthState(state);
  return buildAniListOAuthUrl(ANILIST_CLIENT_ID, state);
}




export async function fetchViewerProfile(token: string): Promise<AniListUserData> {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
          medium
        }
        bannerImage
        about
        statistics {
          anime {
            count
            episodesWatched
            minutesWatched
            meanScore
            standardDeviation
          }
        }
      }
    }
  `;
  const data = await queryAniList<{ Viewer: AniListUserData }>(query, {}, token);
  return data.Viewer;
}




export async function fetchTrendingAnime(page: number = 1, perPage: number = 15): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id
          title { english romaji native }
          synonyms
          isAdult
          coverImage { extraLarge large medium color }
          bannerImage
          description(asHtml: false)
          averageScore
          popularity
          format
          episodes
          status
          seasonYear
          season
          genres
          duration
          studios(isMain: true) { nodes { name } }
          nextAiringEpisode { episode airingAt timeUntilAiring }
        }
      }
    }
  `;
  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(query, { page, perPage });
  return data.Page.media;
}




export async function fetchAniListMediaById(id: number): Promise<AniListMedia | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { english romaji native }
        synonyms
        isAdult
        coverImage { extraLarge large medium color }
        bannerImage
        description(asHtml: false)
        averageScore
        popularity
        format
        episodes
        status
        seasonYear
        season
        genres
        duration
        studios(isMain: true) { nodes { name } }
        nextAiringEpisode { episode airingAt timeUntilAiring }
        relations {
          edges {
            relationType
            node {
              id
              type
              format
              countryOfOrigin
              title { english romaji native }
              synonyms
              description(asHtml: false)
              coverImage { extraLarge large medium color }
              siteUrl
              isAdult
            }
          }
        }
      }
    }
  `;
  const data = await queryAniList<{ Media: AniListMedia | null }>(query, { id });
  return data.Media ?? null;
}

export async function fetchPopularSeasonAnime(
  page: number = 1,
  perPage: number = 15,
  season: 'FALL' | 'WINTER' | 'SPRING' | 'SUMMER' = 'FALL',
  seasonYear: number = 2024
): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, season: $season, seasonYear: $seasonYear) {
          id
          title { english romaji native }
          synonyms
          isAdult
          coverImage { extraLarge large medium color }
          bannerImage
          description(asHtml: false)
          averageScore
          popularity
          format
          episodes
          status
          seasonYear
          season
          genres
          duration
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;
  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(query, {
    page,
    perPage,
    season,
    seasonYear,
  });
  return data.Page.media;
}




export async function fetchTopRatedAnime(page: number = 1, perPage: number = 15): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: SCORE_DESC) {
          id
          title { english romaji native }
          synonyms
          isAdult
          coverImage { extraLarge large medium color }
          bannerImage
          description(asHtml: false)
          averageScore
          format
          episodes
          status
          seasonYear
          genres
          duration
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;
  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(query, { page, perPage });
  return data.Page.media;
}




export async function fetchPopularAllTimeAnime(page: number = 1, perPage: number = 15): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC) {
          id
          title { english romaji native }
          synonyms
          isAdult
          coverImage { extraLarge large medium color }
          bannerImage
          description(asHtml: false)
          averageScore
          popularity
          format
          episodes
          status
          seasonYear
          genres
          duration
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;
  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(query, { page, perPage });
  return data.Page.media;
}




export async function searchAniList(
  search: string,
  genre?: string,
  page: number = 1,
  perPage: number = 24
): Promise<AniListMedia[]> {
  const query = `
    query ($search: String, $genre: String, $page: Int, $perPage: Int) {
      AnimePage: Page(page: $page, perPage: $perPage) {
        media(type: ANIME, search: $search, genre: $genre, sort: SEARCH_MATCH) {
          id
          title { english romaji native }
          synonyms
          isAdult
          coverImage { extraLarge large medium color }
          bannerImage
          description(asHtml: false)
          averageScore
          format
          episodes
          status
          seasonYear
          genres
          duration
          studios(isMain: true) { nodes { name } }
        }
      }
      MangaPage: Page(page: 1, perPage: 8) {
        media(type: MANGA, search: $search, sort: SEARCH_MATCH) {
          id
          title { english romaji native }
          synonyms
          relations {
            edges {
              node {
                id
                type
                title { english romaji native }
                synonyms
                isAdult
                coverImage { extraLarge large medium color }
                bannerImage
                description(asHtml: false)
                averageScore
                popularity
                format
                episodes
                status
                seasonYear
                season
                genres
                duration
                studios(isMain: true) { nodes { name } }
              }
            }
          }
        }
      }
    }
  `;
  const variables: Record<string, any> = { page, perPage };
  if (search && search.trim()) variables.search = search.trim();
  if (genre && genre !== 'All' && genre !== 'Season' && genre !== 'Movies') variables.genre = genre;

  const data = await queryAniList<{
    AnimePage: { media: AniListMedia[] };
    MangaPage: { media: AniListMedia[] };
  }>(query, variables);
  return mergeAniListSearchResults(data.AnimePage.media, data.MangaPage.media);
}

export async function fetchAiringSchedule(
  startAirSec: number,
  endAirSec: number,
  perPage: number = 30
): Promise<AiringScheduleItem[]> {
  const query = `
    query ($startAirSec: Int, $endAirSec: Int, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        airingSchedules(airingAt_greater: $startAirSec, airingAt_lesser: $endAirSec, sort: TIME) {
          id
          airingAt
          timeUntilAiring
          episode
          media {
            id
            title { english romaji native }
            synonyms
            isAdult
            coverImage { large extraLarge }
            format
            episodes
            averageScore
            genres
          }
        }
      }
    }
  `;
  const data = await queryAniList<{ Page: { airingSchedules: AiringScheduleItem[] } }>(query, {
    startAirSec,
    endAirSec,
    perPage,
  });
  return data.Page.airingSchedules;
}




export async function fetchUserAnimeList(
  userName: string,
  token?: string | null
): Promise<AniListUserCollection> {
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME) {
        user {
          id
          name
          avatar { large medium }
          bannerImage
          statistics {
            anime {
              count
              episodesWatched
              minutesWatched
              meanScore
            }
          }
        }
        lists {
          name
          status
          isCustomList
          entries {
            id
            status
            score(format: POINT_100)
            progress
            updatedAt
            media {
              id
              title { english romaji native }
              synonyms
              isAdult
              coverImage { extraLarge large medium color }
              bannerImage
              format
              episodes
              averageScore
              genres
              description(asHtml: false)
              status
              seasonYear
              duration
              nextAiringEpisode { episode airingAt timeUntilAiring }
            }
          }
        }
      }
    }
  `;
  const data = await queryAniList<{ MediaListCollection: AniListUserCollection }>(
    query,
    { userName },
    token
  );
  return data.MediaListCollection;
}




export async function saveUserMediaListEntry(
  token: string,
  mediaId: number,
  status: 'CURRENT' | 'COMPLETED' | 'PLANNING' | 'DROPPED' | 'PAUSED' | 'REPEATING',
  progress?: number,
  scoreRaw?: number
): Promise<{ id: number; status: string; progress: number }> {
  const mutation = `
    mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
      SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) {
        id
        mediaId
        status
        progress
        score
      }
    }
  `;
  const variables: Record<string, any> = { mediaId, status };
  if (typeof progress === 'number') variables.progress = progress;
  if (typeof scoreRaw === 'number') variables.scoreRaw = scoreRaw;

  const res = await queryAniList<{ SaveMediaListEntry: { id: number; status: string; progress: number } }>(
    mutation,
    variables,
    token
  );
  return res.SaveMediaListEntry;
}




export async function deleteUserMediaListEntry(token: string, id: number): Promise<boolean> {
  const mutation = `
    mutation ($id: Int) {
      DeleteMediaListEntry (id: $id) {
        deleted
      }
    }
  `;
  const res = await queryAniList<{ DeleteMediaListEntry: { deleted: boolean } }>(
    mutation,
    { id },
    token
  );
  return res.DeleteMediaListEntry.deleted;
}




const CATALOG_CACHE_KEY = STORAGE_KEYS.LIVE_CATALOG_CACHE;
const USER_DATA_CACHE_KEY = 'anilife_anilist_data_v3';

export function loadCachedCatalog(): any[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCachedCatalog(catalog: any[]): void {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    
  }
}

export function saveCachedAniListData(data: any): void {
  try {
    localStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(data));
  } catch {
    
  }
}

export function loadCachedAniListData(): any | null {
  try {
    const raw = localStorage.getItem(USER_DATA_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


