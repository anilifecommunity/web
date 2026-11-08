import type { AdapterContext, PlaybackOffer, PlaybackStream, PlaybackSubtitle, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { readJsonCapped, safeFetch } from '../guards';

const BASE = 'https://anichan.to';
const HOSTS = new Set(['anichan.to']);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MAX_JSON = 262_144;

interface AniChanServer {
  name?: string;
  label?: string;
  stream?: string;
  rank?: number;
  subtitles?: Array<{ url?: string; lang?: string }>;
}

function absolute(url: string): string {
  const full = url.startsWith('/') ? `${BASE}${url}` : url;
  return full.replace(/ /g, '%20');
}

function languageCode(label: string): string {
  const value = label.trim().toLowerCase();
  const known: Record<string, string> = {
    english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de',
    italian: 'it', arabic: 'ar', russian: 'ru', hindi: 'hi', japanese: 'ja',
    korean: 'ko', chinese: 'zh', indonesian: 'id', turkish: 'tr', polish: 'pl',
  };
  return known[value] ?? value.slice(0, 2);
}

/** AniChan aggregates MegaPlay and VidHawk; this app reaches both by shorter routes. */
function duplicateBackend(name: string): boolean {
  const value = name.toLowerCase();
  return value.startsWith('megaplay') || value === 'vidhawk';
}

async function mintSession(context: AdapterContext): Promise<string> {
  const response = await safeFetch(
    `${BASE}/api/watch/session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ token: '' }),
      signal: context.signal,
    },
    { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: 16_384 }
  );

  if (!response.ok) throw new ResolverError('provider_unavailable');

  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/anichan_ws=([^;,\s]+)/);
  if (!match) throw new ResolverError('provider_unavailable');
  return `anichan_ws=${match[1]}`;
}

async function fetchServers(
  request: ResolveRequest,
  cookie: string,
  context: AdapterContext
): Promise<AniChanServer[]> {
  const category = request.audio === 'dub' ? 'dub' : 'sub';
  const url = `${BASE}/api/watch/servers?anilistId=${encodeURIComponent(String(request.aniListId))}` +
    `&ep=${encodeURIComponent(request.episodeRef)}&category=${category}`;

  const response = await safeFetch(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        Cookie: cookie,
      },
      signal: context.signal,
    },
    { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: MAX_JSON }
  );

  if (response.status === 401) throw new ResolverError('auth_required');
  if (!response.ok) throw new ResolverError('provider_unavailable');

  const data = (await readJsonCapped(response, MAX_JSON)) as { servers?: unknown };
  if (!data || !Array.isArray(data.servers)) throw new ResolverError('invalid_response');
  return data.servers as AniChanServer[];
}

function buildOffer(request: ResolveRequest, servers: AniChanServer[]): PlaybackOffer {
  const usable = servers
    .filter((server) => server && typeof server.stream === 'string' && server.stream.length > 0)
    .filter((server) => !duplicateBackend(String(server.name ?? '')))
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));

  if (usable.length === 0) throw new ResolverError('no_streams');

  const audio = request.audio === 'dub' ? 'dub' : 'sub';
  const streams: PlaybackStream[] = usable.map((server, index) => ({
    format: 'hls',
    audio,
    url: absolute(String(server.stream)),
    quality: (server.label ?? server.name ?? `Server ${index + 1}`).replace(/^\?/, '').trim() || null,
    expiresAt: null,
  }));

  const lead = usable[0];
  const seen = new Set<string>();
  const subtitles: PlaybackSubtitle[] = [];
  for (const track of Array.isArray(lead.subtitles) ? lead.subtitles : []) {
    if (!track || typeof track.url !== 'string' || !track.url.includes('.vtt')) continue;
    const url = absolute(track.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const label = (track.lang ?? 'Subtitles').trim();
    subtitles.push({ language: languageCode(label), label, url, kind: 'vtt' });
  }

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? null,
    episodeRef: request.episodeRef,
    providerId: 'anichan',
    // Browser evidence is recorded per provider in docs/PROVIDER_MATRIX.md. Until the media CDN
    // is measured from a real browser, this stays unknown rather than claiming support.
    rightsStatus: 'unknown',
    browserSupport: 'unknown',
    streams,
    subtitles,
  };
}

/**
 * AniChan resolver: one small JSON GET keyed on the AniList id, plus a session cookie minted by
 * an explicit POST. There is no search request and no title matching.
 */
export async function resolveAnichan(request: ResolveRequest, context: AdapterContext): Promise<PlaybackOffer> {
  const cookie = await mintSession(context);
  const servers = await fetchServers(request, cookie, context);
  return buildOffer(request, servers);
}
