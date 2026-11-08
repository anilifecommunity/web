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

export interface MediaIndexSkipData {
  op?: [number, number];
  ed?: [number, number];
  recap?: [number, number];
}

/**
 * Anilife-owned static metadata index, served by jsDelivr.
 *
 * Layout is `data/anime/{shard}/{anilistId}/...` and shard is `floor(id / 1000)`.
 * The repository is MIT-0 and browser-readable (CORS `*`), so episode, skip and
 * backdrop enrichment never needs a server.
 */
const MEDIA_INDEX_BASE = 'https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/data';

async function fetchIndexJson<T>(subpath: string): Promise<T | null> {
  try {
    const res = await fetch(`${MEDIA_INDEX_BASE}/${subpath}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const episodeCache = new Map<number, MediaIndexEpisode[]>();
let dubIndexSet: Set<number> | null = null;
let backdropMap: Record<string, string> | null = null;

export function mediaIndexShard(anilistId: number): number {
  if (!Number.isFinite(anilistId) || anilistId < 0) return 0;
  return Math.floor(anilistId / 1000);
}

export async function fetchMediaIndexEpisodes(anilistId: number): Promise<MediaIndexEpisode[]> {
  if (episodeCache.has(anilistId)) {
    return episodeCache.get(anilistId)!;
  }
  const data = await fetchIndexJson<MediaIndexEpisode[]>(
    `anime/${mediaIndexShard(anilistId)}/${anilistId}/episodes.json`
  );
  const episodes = Array.isArray(data) ? data : [];
  episodeCache.set(anilistId, episodes);
  return episodes;
}

export async function fetchMediaIndexSkip(anilistId: number, episodeNum: number, malId?: number): Promise<MediaIndexSkipData | null> {
  const data = await fetchIndexJson<any>(
    `skip/${mediaIndexShard(anilistId)}/${anilistId}.json`
  );
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

