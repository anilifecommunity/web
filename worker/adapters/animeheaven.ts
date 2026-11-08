import type { AdapterContext, PlaybackOffer, PlaybackStream, ResolveRequest } from '../../src/resolver';
import { ResolverError } from '../../src/resolver';
import { fetchAniListTitles } from '../anilist';
import { readTextCapped, safeFetch } from '../guards';

const BASE = 'https://animeheaven.me';
const HOSTS = new Set(['animeheaven.me']);
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const MAX_HTML = 512_000;
const MIN_TITLE_SCORE = 0.45;
const MAX_SEARCH_QUERIES = 4;
const MAX_PROBE_PAGES = 3;

export interface HeavenSearchResult {
  path: string;
  title: string;
}

export interface HeavenEpisode {
  number: number;
  gateKey: string;
}

const CARD_START = /<div\b[^>]*\bclass\s*=\s*['"][^'"]*\b(?:similarimg|chart)\b[^'"]*['"][^>]*>/gi;
const ANIME_ANCHOR = /<a\b[^>]*\bhref\s*=\s*['"]?(?:https:\/\/animeheaven\.me\/|\/)?(anime\.php\?[^'"\s>]+)/i;
const NAME_ANCHOR = /<div\b[^>]*\bclass\s*=\s*['"][^'"]*\b(?:similarname|charttitle)\b[^'"]*['"][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i;
const IMG_TAG = /<img\b[^>]*>/i;
const GATE_ANCHOR = /gatea\(\s*(?:"|&quot;|')([0-9a-f]+)(?:"|&quot;|')\s*\)/gi;
const WATCH_NUMBER = /<div\b[^>]*\bwatch2\b[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/div>/i;
const SOURCE_TAG = /<source\b[^>]*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#039': "'",
};

function fromCodePoint(value: number): string | null {
  try {
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : null;
  } catch {
    return null;
  }
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) {
      return fromCodePoint(parseInt(lower.slice(2), 16)) ?? match;
    }
    if (lower.startsWith('#')) {
      return fromCodePoint(Number(lower.slice(1))) ?? match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

export function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function segments(html: string, starts: number[]): string[] {
  return starts.map((start, index) => html.substring(start, starts[index + 1] ?? html.length));
}

export function parseSearch(html: string): HeavenSearchResult[] {
  const starts = [...html.matchAll(CARD_START)].map((match) => (match.index ?? 0) + match[0].length);
  const results: HeavenSearchResult[] = [];
  const seen = new Set<string>();

  for (const block of segments(html, starts)) {
    const path = block.match(ANIME_ANCHOR)?.[1];
    if (!path) continue;
    const name = block.match(NAME_ANCHOR)?.[1];
    const title = (name ? stripTags(name) : '') ||
      (IMG_TAG.test(block) ? decodeEntities(attr(block.match(IMG_TAG)?.[0] ?? '', 'alt') ?? '') : '');
    if (!title.trim() || seen.has(path)) continue;
    seen.add(path);
    results.push({ path, title: title.trim() });
  }

  return results;
}

export function parseEpisodes(html: string): HeavenEpisode[] {
  const anchors = [...html.matchAll(GATE_ANCHOR)]
    .map((match) => ({ key: match[1], start: (match.index ?? 0) + match[0].length }))
    .filter((anchor) => Boolean(anchor.key));

  const episodes: HeavenEpisode[] = [];
  const seen = new Set<number>();

  anchors.forEach((anchor, index) => {
    const end = anchors[index + 1]?.start ?? html.length;
    const raw = html.substring(anchor.start, end).match(WATCH_NUMBER)?.[1];
    if (!raw) return;
    const number = Math.trunc(Number(raw));
    if (!Number.isFinite(number) || number < 1 || seen.has(number)) return;
    seen.add(number);
    episodes.push({ number, gateKey: anchor.key });
  });

  return episodes.sort((a, b) => a.number - b.number);
}

/**
 * Real mirrors only. The page opens with a `<source>` hidden in an HTML comment (a short decoy
 * clip); comments are stripped, and when the gate key is known only files carrying it are kept.
 */
export function parseVideoUrls(html: string, gateKey: string): string[] {
  let cleaned = html;
  let previous = '';
  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(HTML_COMMENT, '');
  }
  const urls = [...cleaned.matchAll(SOURCE_TAG)]
    .map((match) => attr(match[0], 'src')?.trim() ?? '')
    .filter((url) => /\.mp4/i.test(url));
  const unique = [...new Set(urls)];
  if (!gateKey) return unique;
  return unique.filter((url) => url.toLowerCase().includes(`?${gateKey.toLowerCase()}`));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Saga of Tanya the Evil Season 2" -> "saga of tanya the evil". */
export function baseSeriesTitle(title: string): string {
  return title
    .replace(/\bseason\s+\d+\b/gi, '')
    .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function seasonHint(titles: string[]): number | null {
  for (const title of titles) {
    const match =
      title.match(/\bseason\s+(\d+)\b/i) ??
      title.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i);
    if (match) return Number(match[1]);
  }
  return null;
}

export function seasonNumber(candidate: string): number | null {
  const match =
    candidate.match(/\bseason\s+(\d+)\b/i) ??
    candidate.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i);
  if (match) return Number(match[1]);
  if (/\bii\b\s*$/i.test(candidate)) return 2;
  if (/\biii\b\s*$/i.test(candidate)) return 3;
  if (/\biv\b\s*$/i.test(candidate)) return 4;
  return null;
}

function bigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
  return set;
}

/** Dice coefficient over character bigrams, with an exact/contains short-circuit. */
export function titleScore(wanted: string, candidate: string): number {
  const a = normalize(wanted);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.82;
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const gram of left) if (right.has(gram)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function searchQueries(titles: string[]): string[] {
  const queries = titles.flatMap((title) => [
    baseSeriesTitle(title),
    title.split(':')[0].trim(),
    title,
  ]);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const key = query.toLowerCase();
    if (query.length < 3 || seen.has(key)) continue;
    seen.add(key);
    unique.push(query);
    if (unique.length >= MAX_SEARCH_QUERIES) break;
  }
  return unique;
}

async function getHtml(url: string, context: AdapterContext, referer?: string, cookie?: string): Promise<string> {
  const response = await safeFetch(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
        ...(referer ? { Referer: referer } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: context.signal,
    },
    { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: MAX_HTML }
  );
  if (!response.ok) throw new ResolverError('provider_unavailable');
  return readTextCapped(response, MAX_HTML);
}

interface Catalogue {
  path: string;
  episodes: HeavenEpisode[];
  cookie?: string;
}

async function getHomeCookie(context: AdapterContext): Promise<string | undefined> {
  try {
    const response = await safeFetch(
      `${BASE}/`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: context.signal,
      },
      { allowedHosts: HOSTS, timeoutMs: context.timeoutMs, maxBytes: MAX_HTML }
    );
    if (!response.ok) return undefined;
    const raw = response.headers.get('set-cookie') ?? '';
    const cookies = ['__cf_bm', 'PHPSESSID']
      .map((name) => {
        const match = raw.match(new RegExp(`${name}=([^;]+)`));
        return match ? `${name}=${match[1]}` : null;
      })
      .filter((value): value is string => Boolean(value));
    return cookies.length > 0 ? cookies.join('; ') : undefined;
  } catch {
    return undefined;
  }
}

async function findCatalogue(
  titles: string[],
  context: AdapterContext
): Promise<Catalogue | null> {
  const cookie = await getHomeCookie(context);
  const candidates: HeavenSearchResult[] = [];
  for (const query of searchQueries(titles)) {
    const html = await getHtml(
      `${BASE}/search.php?s=${encodeURIComponent(query).replace(/%20/g, '+')}`,
      context,
      `${BASE}/`,
      cookie
    );
    candidates.push(...parseSearch(html));
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) return null;

  const seenPaths = new Set<string>();
  const hinted = seasonHint(titles);
  const ranked = candidates
    .filter((candidate) => {
      if (seenPaths.has(candidate.path)) return false;
      seenPaths.add(candidate.path);
      return true;
    })
    .map((candidate) => ({
      candidate,
      score: titles.reduce((best, title) => Math.max(best, titleScore(baseSeriesTitle(title), candidate.title)), 0),
      season: seasonPriority(hinted, candidate.title),
    }))
    .filter((entry) => entry.score >= MIN_TITLE_SCORE)
    .sort((a, b) => b.season - a.season || b.score - a.score)
    .slice(0, MAX_PROBE_PAGES);

  for (const entry of ranked) {
    const page = await getHtml(`${BASE}/${entry.candidate.path}`, context, `${BASE}/`, cookie);
    const episodes = parseEpisodes(page);
    if (episodes.length > 0) return { path: entry.candidate.path, episodes, cookie };
  }

  return null;
}

function seasonPriority(wanted: number | null, candidate: string): number {
  if (wanted === null) return 1;
  const found = seasonNumber(candidate) ?? 1;
  return found === wanted ? 2 : 0;
}

function mirrorLabel(url: string, index: number): string {
  try {
    const host = new URL(url).hostname;
    return `Mirror ${index + 1} (${host.split('.')[0]})`;
  } catch {
    return `Mirror ${index + 1}`;
  }
}

/**
 * AnimeHeaven: three HTML GETs, then progressive MP4 served with `206`, `Accept-Ranges: bytes`
 * and no Referer requirement. The media itself needs no proxy and plays in a plain `<video>`.
 * Catalogue is sub-only with burned-in subtitles.
 */
export async function resolveAnimeHeaven(
  request: ResolveRequest,
  context: AdapterContext
): Promise<PlaybackOffer> {
  if (request.audio === 'dub') throw new ResolverError('audio_unavailable');

  const meta = await fetchAniListTitles(request.aniListId, context.timeoutMs, context.signal);
  if (!meta) throw new ResolverError('provider_unavailable');

  const titles = [meta.titles.english, meta.titles.romaji, meta.titles.native]
    .filter((title): title is string => Boolean(title && title.trim()));
  if (titles.length === 0) throw new ResolverError('provider_unavailable');

  const catalogue = await findCatalogue(titles, context).catch(() => null);
  if (!catalogue) throw new ResolverError('provider_unavailable');

  const episodeNumber = Number(request.episodeRef);
  const episode = catalogue.episodes.find((entry) => entry.number === episodeNumber);
  if (!episode) throw new ResolverError('provider_unavailable');

  const gate = await getHtml(
    `${BASE}/gate.php`,
    context,
    `${BASE}/${catalogue.path}`,
    `key=${episode.gateKey}`
  ).catch(() => {
    throw new ResolverError('provider_unavailable');
  });
  const urls = parseVideoUrls(gate, episode.gateKey);
  if (urls.length === 0) throw new ResolverError('no_streams');

  const streams: PlaybackStream[] = urls.map((url, index) => ({
    format: 'mp4',
    audio: 'sub',
    url,
    quality: mirrorLabel(url, index),
    expiresAt: null,
  }));

  return {
    schemaVersion: 1,
    aniListId: request.aniListId,
    malId: request.malId ?? meta.malId ?? null,
    episodeRef: request.episodeRef,
    providerId: 'animeheaven',
    rightsStatus: 'unknown',
    // Measured 2026-11-08: MP4 answers 206 with Accept-Ranges and no Referer requirement.
    // Playback through a plain <video> element needs no CORS grant.
    browserSupport: 'supported',
    streams,
    subtitles: [],
  };
}
