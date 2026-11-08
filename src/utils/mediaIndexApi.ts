export interface MediaIndexEpisode {
  id?: string;
  number: number;
  title: string;
  image?: string;
  still?: string;
  airDate?: string;
  air_date?: string;
  description?: string;
  overview?: string;
  length?: number;
  runtime?: number;
  rating?: number;
  skipId?: string;
}

export interface MediaIndexLiliRecord {
  base: string;
  episodes: Record<string, string>;
  length?: number;
  skipId?: string;
}

export interface MediaIndexSkipData {
  op?: [number, number];
  ed?: [number, number];
  recap?: [number, number];
}

const MEDIA_INDEX_PRIMARY = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/main/data';
const MEDIA_INDEX_FALLBACK = 'https://cdn.jsdelivr.net/gh/immafurryfemboy/fish@main/data';

async function fetchIndexJson<T>(subpath: string): Promise<T | null> {
  const sources = [
    `${MEDIA_INDEX_PRIMARY}/${subpath}`,
    `${MEDIA_INDEX_FALLBACK}/${subpath}`
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

const episodeCache = new Map<number, MediaIndexEpisode[]>();
const liliStreamCache = new Map<number, MediaIndexLiliRecord | null>();
let dubIndexSet: Set<number> | null = null;
let backdropMap: Record<string, string> | null = null;

export async function fetchMediaIndexEpisodes(anilistId: number): Promise<MediaIndexEpisode[]> {
  if (episodeCache.has(anilistId)) {
    return episodeCache.get(anilistId)!;
  }
  const shard = Math.floor(anilistId / 1000);
  const data = await fetchIndexJson<MediaIndexEpisode[]>(`anime/${shard}/${anilistId}/episodes.json`);
  if (Array.isArray(data)) {
    episodeCache.set(anilistId, data);
    return data;
  }
  episodeCache.set(anilistId, []);
  return [];
}

export async function fetchMediaIndexLiliStream(anilistId: number): Promise<MediaIndexLiliRecord | null> {
  if (liliStreamCache.has(anilistId)) {
    return liliStreamCache.get(anilistId)!;
  }
  const shard = Math.floor(anilistId / 1000);
  const record = await fetchIndexJson<MediaIndexLiliRecord>(`anime/${shard}/${anilistId}/lili.json`);
  if (record && record.base && record.episodes) {
    liliStreamCache.set(anilistId, record);
    return record;
  }
  liliStreamCache.set(anilistId, null);
  return null;
}

export async function fetchMediaIndexSkip(anilistId: number, episodeNum: number, malId?: number): Promise<MediaIndexSkipData | null> {
  const shard = Math.floor(anilistId / 1000);
  const data = await fetchIndexJson<any>(`skip/${shard}/${anilistId}.json`);
  if (data?.episodes?.[String(episodeNum)] && Array.isArray(data.episodes[String(episodeNum)])) {
    const result: MediaIndexSkipData = {};
    for (const item of data.episodes[String(episodeNum)]) {
      const [type, start, end] = item;
      if (type === 'op' || type === 'mixed-op') result.op = [Number(start), Number(end)];
      else if (type === 'ed' || type === 'mixed-ed') result.ed = [Number(start), Number(end)];
      else if (type === 'recap') result.recap = [Number(start), Number(end)];
    }
    return result;
  }

  if (malId) {
    try {
      const aniskipUrl = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=0`;
      const res = await fetch(aniskipUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.found && Array.isArray(json.results)) {
          const result: MediaIndexSkipData = {};
          for (const item of json.results) {
            const type = item.skipType;
            const start = item.interval?.startTime;
            const end = item.interval?.endTime;
            if (typeof start === 'number' && typeof end === 'number') {
              if (type === 'op' || type === 'mixed-op') result.op = [start, end];
              else if (type === 'ed' || type === 'mixed-ed') result.ed = [start, end];
              else if (type === 'recap') result.recap = [start, end];
            }
          }
          return result;
        }
      }
    } catch {}
  }
  return null;
}

export async function isAnimeDubbed(anilistId: number): Promise<boolean> {
  if (!dubIndexSet) {
    const ids = await fetchIndexJson<number[]>('dub-index.json');
    dubIndexSet = new Set(Array.isArray(ids) ? ids : []);
  }
  return dubIndexSet.has(anilistId);
}

export async function fetchBackdrops(): Promise<Record<string, string>> {
  if (backdropMap) return backdropMap;
  const data = await fetchIndexJson<{ titles?: Record<string, string> }>('backdrops.json');
  backdropMap = data?.titles || {};
  return backdropMap;
}