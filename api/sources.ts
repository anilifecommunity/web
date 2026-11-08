import {
  parseZokoHtml,
  sanitizeAniChanSubtitleUrl,
  ResolvedStreamSource
} from '../src/utils/scraperParsers';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const malIdCache = new Map<number, number>();

async function resolveMalId(anilistId: number): Promise<number | null> {
  if (malIdCache.has(anilistId)) return malIdCache.get(anilistId)!;
  try {
    const query = `query ($id: Int) { Media(id: $id) { idMal } }`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { id: anilistId } })
    });
    if (res.ok) {
      const json = await res.json();
      const idMal = json.data?.Media?.idMal;
      if (typeof idMal === 'number') {
        malIdCache.set(anilistId, idMal);
        return idMal;
      }
    }
  } catch {}
  return null;
}

async function scrapeZoko(
  anilistId: number,
  episode: number,
  audio: 'sub' | 'dub',
  explicitMalId?: number
): Promise<ResolvedStreamSource | null> {
  const malId = explicitMalId || (await resolveMalId(anilistId));
  if (!malId) return null;
  try {
    const targetAudio = audio === 'dub' ? 'dub' : 'sub';
    const url = `https://zokoanime.video/stream/mal/${malId}/${episode}/${targetAudio}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const payload = parseZokoHtml(html);
    if (payload && payload.src) {
      const subtitles = (payload.subtitles || []).map(sub => ({
        language: sub.lang || 'en',
        label: sub.label || 'English',
        url: sub.src,
        default: sub.default
      }));
      return {
        provider: 'zoko',
        streamUrl: payload.src,
        quality: '1080p',
        format: 'hls',
        audio: targetAudio,
        referer: 'https://zokoanime.video/',
        subtitles,
        skip: payload.skip ?? undefined
      };
    }
  } catch {}
  return null;
}

async function scrapeAniChan(
  anilistId: number,
  episode: number,
  audio: 'sub' | 'dub'
): Promise<ResolvedStreamSource | null> {
  try {
    const targetCategory = audio === 'dub' ? 'dub' : 'sub';
    const url = `https://anichan.to/api/watch/servers?anilistId=${anilistId}&ep=${episode}&category=${targetCategory}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && Array.isArray(json.servers) && json.servers.length > 0) {
      const server = json.servers.find((s: { stream?: string }) => Boolean(s.stream));
      if (server && server.stream) {
        const absStream = server.stream.startsWith('http') ? server.stream : `https://anichan.to${server.stream}`;
        const subtitles = Array.isArray(server.subtitles)
          ? server.subtitles.map((sub: { lang?: string; url?: string }) => ({
              language: (sub.lang || 'en').slice(0, 2).toLowerCase(),
              label: sub.lang || 'English',
              url: sanitizeAniChanSubtitleUrl(sub.url || '', 'https://anichan.to')
            }))
          : [];
        return {
          provider: 'anichan',
          streamUrl: absStream,
          quality: server.label || server.name || '1080p',
          format: 'hls',
          audio: targetCategory,
          subtitles
        };
      }
    }
  } catch {}
  return null;
}

const ADAPTERS: Record<string, (anilistId: number, episode: number, audio: 'sub' | 'dub', malId?: number) => Promise<ResolvedStreamSource | null>> = {
  zoko: scrapeZoko,
  anichan: scrapeAniChan
};

/**
 * Provider-keyed resolver endpoint.
 *
 * There is deliberately no `url` parameter: callers name a provider, never a
 * destination. A request for a provider this build does not implement fails with
 * an explicit reason instead of falling through to a different source.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = req.query || {};
  const provider = String(query.provider || '');
  const animeId = parseInt(query.animeId as string, 10);
  const malId = query.malId ? parseInt(query.malId as string, 10) : undefined;
  const episode = parseInt(query.episode as string, 10) || 1;
  const audio = (query.audio === 'dub' ? 'dub' : 'sub') as 'sub' | 'dub';

  if (isNaN(animeId) && !malId) {
    return res.status(400).json({ success: false, error: 'missing_media_id' });
  }

  const adapter = ADAPTERS[provider];
  if (!adapter) {
    return res.status(400).json({ success: false, error: 'unknown_provider', provider });
  }

  const source = await adapter(animeId, episode, audio, malId);
  if (!source) {
    return res.status(404).json({ success: false, error: 'provider_unavailable', provider });
  }

  return res.status(200).json({ success: true, source });
}
