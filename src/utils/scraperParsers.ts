




export interface ZokoSubtitle {
  lang: string;
  label: string;
  src: string;
  default?: boolean;
}

export interface ZokoPayload {
  src?: string;
  download_url?: string;
  subtitles?: ZokoSubtitle[];
  skip?: {
    intro?: [number, number];
    outro?: [number, number];
  } | null;
  [key: string]: unknown;
}

export interface ResolvedStreamSource {
  provider: string;
  streamUrl: string;
  quality: string;
  format: 'hls' | 'mp4' | 'dash';
  audio: 'sub' | 'dub';
  referer?: string;
  subtitles?: Array<{
    language: string;
    label: string;
    url: string;
    default?: boolean;
  }>;
  skip?: {
    intro?: [number, number];
    outro?: [number, number];
  };
}

const ZOKO_XOR_KEY = 'otaku-embed-v1';





export function decodeZokoPayload(base64Payload: string): ZokoPayload | null {
  try {
    const raw = Buffer.from(base64Payload, 'base64');
    const key = Buffer.from(ZOKO_XOR_KEY, 'ascii');
    const decoded = Buffer.alloc(raw.length);

    for (let i = 0; i < raw.length; i++) {
      decoded[i] = raw[i] ^ key[i % key.length];
    }

    const jsonStr = decoded.toString('utf-8');
    return JSON.parse(jsonStr) as ZokoPayload;
  } catch {
    return null;
  }
}




export function parseZokoHtml(html: string): ZokoPayload | null {
  const match = html.match(/window\.__P\s*=\s*["']([A-Za-z0-9+/=]+)["']/);
  if (!match || !match[1]) return null;
  return decodeZokoPayload(match[1]);
}

/**
 * Sanitizes AniChan subtitle URLs (percent-encodes raw spaces in track filenames)
 * Ported from com.anilili.data.remote.AniChanParser
 */
export function sanitizeAniChanSubtitleUrl(url: string, baseUrl = 'https:
  const absolute = url.startsWith('/') ? `${baseUrl}${url}` : url;
  return absolute.replace(/ /g, '%20');
}




export function calculateMediaIndexShard(anilistId: number): number {
  if (isNaN(anilistId) || anilistId < 0) return 0;
  return Math.floor(anilistId / 1000);
}




export function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return relativeOrAbsolute;
  }
}





export function rewriteM3u8Content(
  m3u8Content: string,
  baseUrl: string,
  proxyBaseUrl = '/api/proxy-stream',
  referer?: string
): string {
  const lines = m3u8Content.split(/\r?\n/);
  const rewrittenLines: string[] = [];

  const makeProxyUrl = (targetUrl: string): string => {
    const absUrl = resolveUrl(targetUrl, baseUrl);
    let proxied = `${proxyBaseUrl}?url=${encodeURIComponent(absUrl)}`;
    if (referer) {
      proxied += `&referer=${encodeURIComponent(referer)}`;
    }
    return proxied;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      rewrittenLines.push(line);
      continue;
    }

    
    if (trimmed.startsWith('#')) {
      let tagLine = line;
      tagLine = tagLine.replace(/URI=["']([^"']+)["']/g, (_match, uri) => {
        return `URI="${makeProxyUrl(uri)}"`;
      });
      rewrittenLines.push(tagLine);
      continue;
    }

    
    rewrittenLines.push(makeProxyUrl(trimmed));
  }

  return rewrittenLines.join('\n');
}
