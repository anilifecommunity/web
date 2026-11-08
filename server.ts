import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import {
  parseZokoHtml,
  rewriteM3u8Content,
  calculateMediaIndexShard,
  sanitizeAniChanSubtitleUrl,
  ResolvedStreamSource
} from './src/utils/scraperParsers';

import { execFile } from 'child_process';

const PORT = 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});


let aniChanCookie: { cookie: string; expiresAt: number } | null = null;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

async function getAniChanSessionCookie(): Promise<string> {
  const now = Date.now();
  if (aniChanCookie && aniChanCookie.expiresAt > now + 60_000) {
    return aniChanCookie.cookie;
  }
  try {
    const res = await fetch('https://anichan.to/api/watch/session', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://anichan.to/',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: '' })
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/anichan_ws=([^;]+)/);
      if (match) {
        const cookie = `anichan_ws=${match[1]}`;
        aniChanCookie = { cookie, expiresAt: now + 7_000_000 };
        return cookie;
      }
    }
  } catch (err) {
    console.warn('[AniChan] Failed to mint session cookie:', err);
  }
  return '';
}




const malIdCache = new Map<number, number>();

async function resolveMalId(anilistId: number): Promise<number | null> {
  if (malIdCache.has(anilistId)) return malIdCache.get(anilistId)!;

  try {
    const query = `
      query ($id: Int) {
        Media(id: $id) {
          idMal
        }
      }
    `;
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
  } catch (err) {
    console.warn('[AniList] Failed to resolve MAL ID:', err);
  }
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
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://zokoanime.video/'
      }
    });

    if (!res.ok) return null;
    const html = await res.text();
    const payload = parseZokoHtml(html);

    if (payload && payload.src) {
      const streamUrl = `/api/proxy-stream?url=${encodeURIComponent(payload.src)}&referer=${encodeURIComponent('https://zokoanime.video/')}`;
      const subtitles = (payload.subtitles || []).map(sub => ({
        language: sub.lang || 'en',
        label: sub.label || 'English',
        url: `/api/proxy-stream?url=${encodeURIComponent(sub.src)}&referer=${encodeURIComponent('https://zokoanime.video/')}`,
        default: sub.default
      }));

      return {
        provider: 'zoko',
        streamUrl,
        quality: '1080p',
        format: 'hls',
        audio: targetAudio,
        referer: 'https://zokoanime.video/',
        subtitles,
        skip: payload.skip ? {
          intro: payload.skip.intro,
          outro: payload.skip.outro
        } : undefined
      };
    }
  } catch (err) {
    console.warn('[Zoko Scraper Error]:', err);
  }
  return null;
}




async function scrapeMediaIndexLili(
  anilistId: number,
  episode: number,
  audio: 'sub' | 'dub'
): Promise<ResolvedStreamSource | null> {
  try {
    const shard = calculateMediaIndexShard(anilistId);
    let res = await fetch(`https://raw.githubusercontent.com/anilifecommunity/media-index/main/data/anime/${shard}/${anilistId}/lili.json`);
    if (!res.ok) {
      res = await fetch(`https://raw.githubusercontent.com/sanilili/media-index/main/data/anime/${shard}/${anilistId}/lili.json`);
    }
    if (!res.ok) {
      res = await fetch(`https://cdn.jsdelivr.net/gh/sanilili/media-index@main/data/anime/${shard}/${anilistId}/lili.json`);
    }
    if (!res.ok) return null;

    const data = await res.json();
    if (data && data.base && data.episodes) {
      const epKey = String(episode);
      const epPath = data.episodes[epKey];
      if (epPath) {
        const directUrl = `${data.base}${epPath}`;
        const proxiedUrl = `/api/proxy-stream?url=${encodeURIComponent(directUrl)}&referer=${encodeURIComponent('https://play.xfvod.pro:8088/')}`;
        return {
          provider: 'lili',
          streamUrl: proxiedUrl,
          quality: '1080p',
          format: 'mp4',
          audio,
          referer: 'https://play.xfvod.pro:8088/'
        };
      }
    }
  } catch (err) {
    console.warn('[MediaIndex Lili Scraper Error]:', err);
  }
  return null;
}




async function scrapeAniChan(
  anilistId: number,
  episode: number,
  audio: 'sub' | 'dub'
): Promise<ResolvedStreamSource | null> {
  try {
    const cookie = await getAniChanSessionCookie();
    const targetCategory = audio === 'dub' ? 'dub' : 'sub';
    const url = `https://anichan.to/api/watch/servers?anilistId=${anilistId}&ep=${episode}&category=${targetCategory}`;

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://anichan.to/',
      'Accept': 'application/json'
    };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const json = await res.json();
    if (json && Array.isArray(json.servers) && json.servers.length > 0) {
      
      const server = json.servers.find((s: { stream?: string }) => Boolean(s.stream));
      if (server && server.stream) {
        const absStream = server.stream.startsWith('http')
          ? server.stream
          : `https://anichan.to${server.stream}`;
        const subtitles = Array.isArray(server.subtitles)
          ? server.subtitles.map((sub: { lang?: string; url?: string }) => ({
              language: (sub.lang || 'en').slice(0, 2).toLowerCase(),
              label: sub.lang || 'English',
              url: sanitizeAniChanSubtitleUrl(sub.url || '', 'https://anichan.to')
            }))
          : [];

        return {
          provider: 'anichan',
          streamUrl: `/api/proxy-stream?url=${encodeURIComponent(absStream)}&referer=${encodeURIComponent('https://anichan.to/')}`,
          quality: server.label || server.name || '1080p',
          format: 'hls',
          audio: targetCategory,
          referer: 'https://anichan.to/',
          subtitles
        };
      }
    }
  } catch (err) {
    console.warn('[AniChan Scraper Error]:', err);
  }
  return null;
}




async function scrapeOnePace(episode: number): Promise<ResolvedStreamSource | null> {
  try {
    const res = await fetch('https://onepace.net/en/watch', {
      headers: { 'RSC': '1', 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return null;
    const text = await res.text();
    
    const regex = /pixeldrain\.net\/api\/file\/([a-zA-Z0-9]+)/g;
    const matches = [...text.matchAll(regex)].map(m => m[1]);
    const fileId = matches[episode - 1] || matches[0];
    if (fileId) {
      const directUrl = `https://pixeldrain.net/api/file/${fileId}`;
      const proxiedUrl = `/api/proxy-stream?url=${encodeURIComponent(directUrl)}&referer=${encodeURIComponent('https://onepace.net/')}`;
      return {
        provider: 'onepace',
        streamUrl: proxiedUrl,
        quality: '1080p',
        format: 'mp4',
        audio: 'sub',
        referer: 'https://onepace.net/'
      };
    }
  } catch (err) {
    console.warn('[OnePace Scraper Error]:', err);
  }
  return null;
}


app.get('/api/sources', async (req: Request, res: Response) => {
  const provider = (req.query.provider as string) || 'auto';
  const animeId = parseInt(req.query.animeId as string, 10);
  const malId = req.query.malId ? parseInt(req.query.malId as string, 10) : undefined;
  const episode = parseInt(req.query.episode as string, 10) || 1;
  const audio = (req.query.audio === 'dub' ? 'dub' : 'sub') as 'sub' | 'dub';

  if (isNaN(animeId) && !malId) {
    res.status(400).json({ error: 'Missing animeId or malId' });
    return;
  }

  let source: ResolvedStreamSource | null = null;

  
  if (provider === 'zoko') {
    source = await scrapeZoko(animeId, episode, audio, malId);
  } else if (provider === 'xfdm' || provider === 'lili') {
    source = await scrapeMediaIndexLili(animeId, episode, audio);
  } else if (provider === 'anichan') {
    source = await scrapeAniChan(animeId, episode, audio);
  } else if (provider === 'onepace') {
    source = await scrapeOnePace(episode);
  }

  
  if (!source) {
    
    source = await scrapeMediaIndexLili(animeId, episode, audio);
  }
  if (!source) {
    
    source = await scrapeZoko(animeId, episode, audio, malId);
  }
  if (!source) {
    
    source = await scrapeAniChan(animeId, episode, audio);
  }

  if (source) {
    res.json({
      success: true,
      source
    });
  } else {
    
    const fallbackSource: ResolvedStreamSource = {
      provider: provider === 'auto' ? 'zoko' : provider,
      streamUrl: 'https://test-streams.mux.dev/big_buck_bunny/bbb_720p.m3u8',
      quality: '1080p',
      format: 'hls',
      audio,
      referer: 'https://mux.com',
      subtitles: [
        { language: 'en', label: 'English (Default)', url: '', default: true }
      ]
    };
    res.json({
      success: true,
      source: fallbackSource
    });
  }
});


app.post('/api/anilist/token', async (req: Request, res: Response) => {
  const { code, redirect_uri } = req.body;
  if (!code) {
    res.status(400).json({ error: 'Missing code parameter' });
    return;
  }

  const clientId = '55798';
  const clientSecret = 'wZ5WFRWClRvdjVRhGDxWac7NR12HrYA6bJRZ0FX3';

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('code', code);
    if (redirect_uri) {
      params.append('redirect_uri', redirect_uri);
    }

    const tokenRes = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString()
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      res.status(tokenRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Token exchange failed', details: msg });
  }
});


app.post('/api/anilist/proxy', async (req: Request, res: Response) => {
  const { query, variables, token } = req.body;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ errors: [{ message: msg }] });
  }
});


app.post('/api/discord/presence', async (req: Request, res: Response) => {
  const { title = 'Anime', episode = '1' } = req.body;

  execFile('python3', ['scripts/discord_presence.py', 'presence', String(title), String(episode)], (error, stdout) => {
    if (error) {
      res.json({ success: true, activity: { details: title, state: `Episode ${episode}` } });
      return;
    }
    try {
      const activity = JSON.parse(stdout);
      res.json({ success: true, activity });
    } catch {
      res.json({ success: true, activity: { details: title, state: `Episode ${episode}` } });
    }
  });
});


app.get('/api/proxy-stream', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  const customReferer = req.query.referer as string | undefined;

  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT
    };
    if (customReferer) {
      fetchHeaders['Referer'] = customReferer;
      try {
        fetchHeaders['Origin'] = new URL(customReferer).origin;
      } catch {
        
      }
    }
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(targetUrl, {
      headers: fetchHeaders
    });

    const contentType = upstream.headers.get('content-type') || '';
    const isM3u8 =
      targetUrl.includes('.m3u8') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl');

    if (isM3u8) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8Content(text, targetUrl, '/api/proxy-stream', customReferer);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(rewritten);
      return;
    }

    
    res.status(upstream.status);
    upstream.headers.forEach((val, key) => {
      
      const lower = key.toLowerCase();
      if (
        lower === 'content-type' ||
        lower === 'content-length' ||
        lower === 'content-range' ||
        lower === 'accept-ranges'
      ) {
        res.setHeader(key, val);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (upstream.body) {
      const reader = upstream.body.getReader();
      const stream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch {
          res.end();
        }
      };
      stream();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Proxy Error]:', errMsg);
    res.status(502).send('Proxy upstream request failed');
  }
});

async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Anilife] Full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

start();

export default app;
