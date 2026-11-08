




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
  (import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined) ?? ''
).trim();

export interface AniListMedia {
  id: number;
  title: {
    english?: string;
    romaji?: string;
    native?: string;
  };
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
  let response: Response;
  try {
    response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`AniList status ${response.status}`);
    }
  } catch {
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
  }

  if (!response.ok) {
    let errDetail = `${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.errors && errJson.errors[0]?.message) {
        errDetail = errJson.errors[0].message;
      }
    } catch {}
    throw new Error(`AniList error: ${errDetail}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'AniList query error');
  }

  return json.data;
}




export function getAniListOAuthUrl(): string {
  if (!ANILIST_CLIENT_ID) {
    throw new Error('AniList sign-in is not configured');
  }
  // AniList's implicit grant uses the redirect URL registered on the application; it does not
  // take a redirect_uri parameter (docs: /guide/auth/implicit). Sending one can make the
  // authorize endpoint reject the request.
  const params = new URLSearchParams({
    client_id: ANILIST_CLIENT_ID,
    response_type: 'token',
  });
  return `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`;
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
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, search: $search, genre: $genre, sort: SEARCH_MATCH) {
          id
          title { english romaji native }
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
  const variables: Record<string, any> = { page, perPage };
  if (search && search.trim()) variables.search = search.trim();
  if (genre && genre !== 'All' && genre !== 'Season' && genre !== 'Movies') variables.genre = genre;

  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(query, variables);
  return data.Page.media;
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
            title { english romaji }
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
              title { english romaji }
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




const OAUTH_KEY = 'anilife_oauth_token';
const CATALOG_CACHE_KEY = 'anilife_live_catalog_cache_v3';
const USER_DATA_CACHE_KEY = 'anilife_anilist_data_v3';

export function loadOAuthToken(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_KEY);
  } catch {
    return null;
  }
}

export function saveOAuthToken(token: string): void {
  try {
    sessionStorage.setItem(OAUTH_KEY, token);
  } catch {
    
  }
}

export function clearOAuthToken(): void {
  try {
    sessionStorage.removeItem(OAUTH_KEY);
  } catch {
    
  }
}

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


