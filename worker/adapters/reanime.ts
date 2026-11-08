import type { AdapterContext, PlaybackOffer, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { readJsonCapped, safeFetch } from '../guards';

const BASE = 'https://reanime.to';
const HOSTS = new Set(['reanime.to']);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_JSON = 262_144;

interface ReanimeServer {
  serverName?: string;
  dataLink?: string;
  dataType?: string;
}

/**
 * Reanime: the episode API names an embed per audio track, and that embed is a Flixcloud player.
 *
 * Flixcloud owns rotating JS/WASM decryption, so there is no manifest to hand to hls.js. Its page
 * is frameable (no X-Frame-Options, no frame-ancestors) and plays in a real browser, so the offer
 * is an embed. The iframe cannot report playback time, which is why the offer marks progress as
 * manual and the player shows a watched control.
 */
export async function resolveReanime(
  request: ResolveRequest,
  context: AdapterContext
): Promise<PlaybackOffer> {
  const url = `${BASE}/api/flix/${encodeURIComponent(String(request.aniListId))}/${encodeURIComponent(request.episodeRef)}`;

  const response = await safeFetch(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Referer: `${BASE}/`,
      },
      signal: context.signal,
    },
    { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: MAX_JSON }
  );

  if (!response.ok) throw new ResolverError('provider_unavailable');

  const data = (await readJsonCapped(response, MAX_JSON)) as {
    success?: boolean;
    servers?: ReanimeServer[];
  };
  if (!data || data.success !== true) throw new ResolverError('invalid_response');

  const servers = Array.isArray(data.servers) ? data.servers : [];
  if (servers.length === 0) throw new ResolverError('no_streams');

  const accepted = request.audio === 'dub' ? new Set(['dub', 's-dub']) : new Set(['sub', 's-sub']);
  const matching = servers.filter(
    (server) =>
      typeof server.dataLink === 'string' &&
      server.dataLink.startsWith('https://') &&
      accepted.has(String(server.dataType ?? '').toLowerCase())
  );
  if (matching.length === 0) throw new ResolverError('audio_unavailable');

  const preferred =
    matching.find((server) => /^hd-2$/i.test(String(server.serverName ?? ''))) ??
    matching.find((server) => /^hd-1$/i.test(String(server.serverName ?? ''))) ??
    matching[0];

  let embedUrl = String(preferred.dataLink);
  if (request.audio === 'dub' && !/[?&]a=/.test(embedUrl)) {
    embedUrl += embedUrl.includes('?') ? '&a=1' : '?a=1';
  }

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? null,
    episodeRef: request.episodeRef,
    providerId: 'reanime',
    rightsStatus: 'unknown',
    // Measured 2026-11-08: the Flixcloud page loads and plays in Chromium with no frame blocks.
    browserSupport: 'supported',
    streams: [],
    subtitles: [],
    embed: {
      url: embedUrl,
      providerId: 'reanime',
      kind: 'player',
      supportsProgress: false,
    },
  };
}
