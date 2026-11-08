import { ResolverError } from './errors';
import type { PlaybackOffer, PlaybackStream, PlaybackSubtitle, SkipWindow } from './types';

const TOP_KEYS = new Set([
  'schemaVersion', 'aniListId', 'malId', 'episodeRef', 'providerId',
  'rightsStatus', 'browserSupport', 'streams', 'subtitles', 'skipWindows', 'errorCode',
]);

const RIGHTS = new Set(['approved', 'pending', 'denied', 'unknown']);
const SUPPORT = new Set(['supported', 'unsupported', 'unknown']);
const FORMATS = new Set(['hls', 'mp4', 'dash']);
const AUDIO = new Set(['sub', 'dub', 'multi', 'unknown']);
const SKIP_KINDS = new Set(['intro', 'outro', 'recap', 'filler']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDateString(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseStream(value: unknown): PlaybackStream | null {
  if (!isRecord(value)) return null;
  if (!FORMATS.has(String(value.format))) return null;
  if (!AUDIO.has(String(value.audio))) return null;
  if (!isHttpsUrl(value.url)) return null;
  if (value.quality != null && typeof value.quality !== 'string') return null;
  if (value.expiresAt != null && !isDateString(value.expiresAt)) return null;
  return {
    format: value.format as PlaybackStream['format'],
    audio: value.audio as PlaybackStream['audio'],
    url: value.url,
    quality: (value.quality as string | null | undefined) ?? null,
    expiresAt: (value.expiresAt as string | null | undefined) ?? null,
  };
}

function parseSubtitle(value: unknown): PlaybackSubtitle | null {
  if (!isRecord(value)) return null;
  if (typeof value.language !== 'string' || value.language.length === 0) return null;
  if (!isHttpsUrl(value.url)) return null;
  if (value.label != null && typeof value.label !== 'string') return null;
  if (value.kind != null && !['vtt', 'srt', 'unknown'].includes(String(value.kind))) return null;
  return {
    language: value.language,
    url: value.url,
    label: value.label as string | undefined,
    kind: value.kind as PlaybackSubtitle['kind'],
  };
}

function parseSkipWindow(value: unknown): SkipWindow | null {
  if (!isRecord(value)) return null;
  if (!SKIP_KINDS.has(String(value.kind))) return null;
  if (!Number.isInteger(value.startMs) || (value.startMs as number) < 0) return null;
  if (!Number.isInteger(value.endMs) || (value.endMs as number) < 0) return null;
  if ((value.endMs as number) <= (value.startMs as number)) return null;
  return {
    kind: value.kind as SkipWindow['kind'],
    startMs: value.startMs as number,
    endMs: value.endMs as number,
  };
}

/**
 * Validates an untrusted provider payload before it reaches the player.
 * Returns null on any structural or policy violation; never coerces a value into looking valid.
 */
export function parsePlaybackOffer(input: unknown): PlaybackOffer | null {
  if (!isRecord(input)) return null;
  for (const key of Object.keys(input)) {
    if (!TOP_KEYS.has(key)) return null;
  }
  if (input.schemaVersion !== 1) return null;
  if (!Number.isInteger(input.aniListId) || (input.aniListId as number) < 1) return null;
  if (input.malId != null && (!Number.isInteger(input.malId) || (input.malId as number) < 1)) return null;
  if (typeof input.episodeRef !== 'string' || input.episodeRef.length === 0) return null;
  if (typeof input.providerId !== 'string' || input.providerId.length === 0) return null;
  if (!RIGHTS.has(String(input.rightsStatus))) return null;
  if (!SUPPORT.has(String(input.browserSupport))) return null;
  if (!Array.isArray(input.streams) || input.streams.length === 0) return null;
  if (!Array.isArray(input.subtitles)) return null;

  const streams = input.streams.map(parseStream);
  if (streams.some((stream) => stream === null)) return null;

  const subtitles = input.subtitles.map(parseSubtitle);
  if (subtitles.some((subtitle) => subtitle === null)) return null;

  let skipWindows: SkipWindow[] | undefined;
  if (input.skipWindows != null) {
    if (!Array.isArray(input.skipWindows)) return null;
    const parsed = input.skipWindows.map(parseSkipWindow);
    if (parsed.some((window) => window === null)) return null;
    skipWindows = parsed as SkipWindow[];
  }

  if (input.errorCode != null && typeof input.errorCode !== 'string') return null;

  return {
    schemaVersion: 1,
    aniListId: input.aniListId as number,
    malId: (input.malId as number | null | undefined) ?? null,
    episodeRef: input.episodeRef,
    providerId: input.providerId,
    rightsStatus: input.rightsStatus as PlaybackOffer['rightsStatus'],
    browserSupport: input.browserSupport as PlaybackOffer['browserSupport'],
    streams: streams as PlaybackStream[],
    subtitles: subtitles as PlaybackSubtitle[],
    ...(skipWindows ? { skipWindows } : {}),
    ...(input.errorCode != null ? { errorCode: input.errorCode as string } : {}),
  };
}

export function assertPlaybackOffer(input: unknown): PlaybackOffer {
  const offer = parsePlaybackOffer(input);
  if (!offer) throw new ResolverError('invalid_response');
  return offer;
}
