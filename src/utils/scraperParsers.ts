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

function base64ToBytes(base64Payload: string): Uint8Array | null {
  try {
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Decodes Zoko's `window.__P` player configuration: base64 over UTF-8 JSON
 * XOR'd with a fixed key. Runs in Node, the browser and Workers alike.
 */
export function decodeZokoPayload(base64Payload: string): ZokoPayload | null {
  const raw = base64ToBytes(base64Payload);
  if (!raw) return null;
  try {
    const key = new TextEncoder().encode(ZOKO_XOR_KEY);
    const decoded = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      decoded[i] = raw[i] ^ key[i % key.length];
    }
    const jsonStr = new TextDecoder().decode(decoded);
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
 * Sanitizes AniChan subtitle URLs (percent-encodes raw spaces in track filenames).
 */
export function sanitizeAniChanSubtitleUrl(url: string, baseUrl = 'https://anichan.to'): string {
  const absolute = url.startsWith('/') ? `${baseUrl}${url}` : url;
  return absolute.replace(/ /g, '%20');
}

/** Shard directory for per-title media-index files: floor(anilistId / 1000). */
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
