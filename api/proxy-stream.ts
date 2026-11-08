import { rewriteM3u8Content } from '../src/utils/scraperParsers';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = req.query || {};
  const targetUrl = query.url as string;
  const customReferer = query.referer as string | undefined;

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT
    };
    if (customReferer) {
      fetchHeaders['Referer'] = customReferer;
      try {
        fetchHeaders['Origin'] = new URL(customReferer).origin;
      } catch {}
    }
    if (req.headers && req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(targetUrl, { headers: fetchHeaders });
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
      return res.status(200).send(rewritten);
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

    const arrayBuffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(502).send('Proxy upstream request failed');
  }
}
