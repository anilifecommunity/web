import type { ProviderDefinition } from './types';

/**
 * Provider registry.
 *
 * IDs, ordering and variants are derived from the Android reference catalogue
 * (`data/ProviderCatalog.kt`, re-read 2026-11-08). `webStatus` is Anilife Web's own assessment:
 * `unverified` means no browser evidence exists yet, not that the provider works.
 *
 * No xfdm entry exists. Its only web path was the scraped `lili.json` archive, which has been
 * removed from this project.
 */

const MIRURO_ORDER = [
  'bee', 'sun', 'pewe', 'hop', 'ally', 'kiwi', 'moo', 'bonk', 'knob',
  'nun', 'bun', 'cog', 'twin', 'telli',
] as const;

const MIRURO_EMBED = new Set(['nun', 'bun', 'twin', 'cog', 'telli']);

const MIRURO_EMBED_PARENTS: Record<string, string> = {
  nun: 'ally',
  bun: 'bee',
  twin: 'bonk',
  cog: 'moo',
};

const MIRURO_VARIANTS: Record<string, Array<'soft' | 'hard'>> = {
  bonk: ['soft', 'hard'],
  kiwi: ['hard'],
  hop: ['soft'],
  ally: ['hard'],
  pewe: ['hard'],
  bee: ['soft'],
  moo: ['hard'],
  nun: ['hard'],
  bun: ['soft'],
  twin: ['hard', 'soft'],
  cog: ['hard'],
  telli: ['hard'],
  sun: ['soft'],
  knob: ['hard'],
};

function miruro(id: string): ProviderDefinition {
  const variants = MIRURO_VARIANTS[id] ?? [];
  const embed = MIRURO_EMBED.has(id);
  return {
    id,
    catalogue: 'miruro',
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    capabilities: {
      audio: ['sub', 'dub'],
      subtitles: variants.includes('soft') ? ['soft', 'external'] : ['hard'],
      formats: embed ? ['iframe'] : ['hls'],
    },
    // The pipe refuses datacenter IPs and sends no CORS headers, so neither a Worker nor a
    // browser can read it. Embeds remain unverified candidates.
    webStatus: embed ? 'unverified' : 'unavailable',
    rightsStatus: 'pending',
    embedParent: MIRURO_EMBED_PARENTS[id],
  };
}

interface AnivexaOptions {
  name?: string;
  status?: ProviderDefinition['webStatus'];
  audio?: Array<'sub' | 'dub' | 'multi'>;
  formats?: ProviderDefinition['capabilities']['formats'];
  subtitles?: ProviderDefinition['capabilities']['subtitles'];
  language?: string;
  adultOnly?: boolean;
  androidId?: string;
  implemented?: boolean;
  evidence?: ProviderDefinition['evidence'];
}

function anivexa(id: string, options: AnivexaOptions = {}): ProviderDefinition {
  const name = options.name ?? id.charAt(0).toUpperCase() + id.slice(1);
  return {
    id,
    catalogue: 'anivexa',
    displayName: name,
    androidId: options.androidId ?? id,
    capabilities: {
      audio: options.audio ?? ['sub', 'dub'],
      subtitles: options.subtitles ?? [],
      formats: options.formats ?? ['hls'],
      ...(options.language ? { regions: [] } : {}),
      adultOnly: options.adultOnly ?? false,
    },
    webStatus: options.status ?? 'unverified',
    rightsStatus: 'unknown',
    declaredLanguage: options.language,
    ...(options.implemented ? { implemented: true } : {}),
    ...(options.evidence ? { evidence: options.evidence } : {}),
  };
}

const ANIVEXA: ProviderDefinition[] = [
  anivexa('anipm'),
  anivexa('anichan', {
    status: 'unavailable',
    subtitles: ['soft', 'external'],
    evidence: [
      {
        date: '2026-11-08',
        test: 'GET /api/watch/episodes returns counts; GET /api/watch/servers returns {"servers":[]} for AniList 21, 154587, 16498 and 52991, with and without a session cookie. Adapter mediates; upstream currently offers no streams.',
        browser: 'none (Worker + node probe)',
      },
    ],
  }),
  anivexa('zoko', {
    audio: ['sub', 'dub'],
    formats: ['iframe'],
    subtitles: ['soft', 'hard', 'external'],
    status: 'iframe',
    implemented: true,
    evidence: [{
      date: '2026-11-15',
      test: 'The documented MAL iframe route loaded One Piece episode 1 and played beyond five minutes in Chromium. The provider publishes raw iframe controls and progress events; its AniList route returned 404, so the Worker maps AniList to MAL first.',
      browser: 'Chromium',
      url: 'https://zokoanime.video/docs',
    }],
  }),
  anivexa('animepahe', { status: 'native-only' }),
  anivexa('rareanimes'),
  anivexa('anidbapp'),
  anivexa('animeheaven', {
    status: 'unavailable',
    audio: ['sub'],
    formats: ['mp4'],
    evidence: [
      {
        date: '2026-11-08',
        test: 'From a residential Node client the flow works (search -> anime.php -> gate.php -> MP4 206). From worker/workerd egress the same search returns a no-results page, so the catalogue never matches. Kept in the codebase for re-test.',
        browser: 'none',
        url: 'https://animeheaven.me',
      },
    ],
  }),
  anivexa('animeonsen'),
  anivexa('anikoto'),
  anivexa('kaa', { name: 'KickAssAnime' }),
  anivexa('allanime', { name: 'MKissa (AllAnime)', status: 'native-only' }),
  anivexa('animekai'),
  anivexa('reanime', {
    status: 'worker-metadata-only',
    implemented: true,
    formats: ['iframe'],
    evidence: [
      {
        date: '2026-11-08',
        test: 'GET /api/flix/{anilistId}/{episode} names a Flixcloud embed per audio track; the embed loads and plays in Chromium with no X-Frame-Options or frame-ancestors. Iframe playback, manual progress.',
        browser: 'Chromium via the in-app browser',
        url: 'https://reanime.to',
      },
      {
        date: '2026-11-15',
        test: 'reanime.to now redirects to reanime.cz. The Worker resolved AniList 21 episode 1 to the correct 24:37 Flixcloud player, and Chromium played it continuously beyond five minutes.',
        browser: 'Worker + Chromium',
        url: 'https://reanime.cz',
      },
    ],
  }),
  anivexa('anizone'),
  anivexa('animegg'),
  anivexa('anineko'),
  anivexa('2dhive'),
  anivexa('animedekho'),
  anivexa('toonhub', {
    name: 'ToonHub4u',
    status: 'unverified',
    evidence: [
      {
        date: '2026-11-08',
        test: 'WordPress REST search (wp-json/wp/v2/search) answers from a server client. Post pages expose base64 redirect links to the player host. Adapter not implemented yet; media host and iframe policy still unverified.',
        browser: 'none',
        url: 'https://toonhub4u.co',
      },
    ],
  }),
  anivexa('uniquestream'),
  anivexa('animekhor'),
  anivexa('kartoons', { name: 'Kartoons (Hindi)', language: 'Hindi', audio: ['dub'] }),
  anivexa('animeav1', { name: 'AnimeAV1 (Espanol)', language: 'Spanish' }),
  anivexa('rift', { name: 'AnimeRift (Arabic)', language: 'Arabic' }),
  anivexa('hanime', { status: 'native-only', adultOnly: true }),
  anivexa('hentaihaven', { status: 'native-only', adultOnly: true }),
  anivexa('hstream', { status: 'unavailable', formats: ['dash'], adultOnly: true }),
];

const OTHER: ProviderDefinition[] = [
  {
    id: 'animeembed',
    catalogue: 'other',
    displayName: 'AnimeEmbed',
    capabilities: { audio: ['sub', 'dub'], formats: ['iframe'], subtitles: ['soft', 'external'] },
    webStatus: 'iframe',
    rightsStatus: 'unknown',
    implemented: true,
    evidence: [
      {
        date: '2026-11-15',
        test: 'The documented AniList iframe loaded One Piece episode 1 for sub and dub. Chromium reported a ready 24:37 video and played it beyond five minutes. The versioned postMessage contract persisted real progress in Anilife.',
        browser: 'Chromium',
        url: 'https://animeembed.com',
      },
    ],
  },
  {
    id: 'vidsrc',
    catalogue: 'other',
    displayName: 'VidSrc',
    capabilities: { audio: ['sub', 'dub'], formats: ['iframe'], subtitles: [] },
    webStatus: 'unverified',
    rightsStatus: 'unknown',
    implemented: true,
    evidence: [
      {
        date: '2026-11-15',
        test: 'AniZip resolved One Piece episode 1 and the outer iframe loaded, but its vidsrc.sh child navigated to a blank page and no media element started. It is not selectable until a fresh browser test succeeds.',
        browser: 'Chromium',
        url: 'https://vidsrc.to',
      },
    ],
  },
  {
    id: 'vidlink',
    catalogue: 'other',
    displayName: 'VidLink',
    capabilities: { audio: ['sub', 'dub'], formats: ['iframe'], subtitles: [] },
    webStatus: 'iframe',
    rightsStatus: 'unknown',
    implemented: true,
    evidence: [
      {
        date: '2026-11-15',
        test: 'AniZip mapped One Piece episode 1 to the correct 24:37 player. A trusted play action advanced media, but the first clicks opened third-party advertising tabs, so Anilife shows its raw-player safety notice.',
        browser: 'Chromium',
        url: 'https://vidlink.pro',
      },
    ],
  },
  {
    id: 'vidfast',
    catalogue: 'other',
    displayName: 'VidFast',
    capabilities: { audio: ['sub', 'dub'], formats: ['iframe'], subtitles: [] },
    webStatus: 'unverified',
    rightsStatus: 'unknown',
    evidence: [
      {
        date: '2026-11-08',
        test: 'AniZip TMDB mapping; vidfast.vc/tv/{tmdb}/{season}/{episode} stayed on "FETCHING, ONE MOMENT..." in Chromium and never started media. Not offered until re-tested.',
        browser: 'Chromium',
        url: 'https://vidfast.vc',
      },
    ],
  },
  {
    id: '2embed',
    catalogue: 'other',
    displayName: '2Embed',
    capabilities: { audio: ['sub', 'dub'], formats: ['iframe'], subtitles: [] },
    webStatus: 'unverified',
    rightsStatus: 'unknown',
    evidence: [
      {
        date: '2026-11-15',
        test: 'AniZip produced the expected IMDb episode URL, but the browser received a rate-limit page instead of a media player. It is not selectable until a fresh browser test succeeds.',
        browser: 'Chromium',
        url: 'https://www.2embed.skin',
      },
    ],
  },
  {
    id: 'onepace',
    catalogue: 'other',
    displayName: 'One Pace',
    capabilities: { audio: ['sub', 'dub'], formats: ['hls', 'mp4'] },
    webStatus: 'unverified',
    rightsStatus: 'unknown',
  },
];

export const PROVIDERS: ProviderDefinition[] = [
  ...MIRURO_ORDER.map(miruro),
  ...ANIVEXA,
  ...OTHER,
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

/** Catalogue fan-out order, mirroring Android's `order`. */
export const PROVIDER_ORDER: string[] = PROVIDERS.map((provider) => provider.id);

/** Statuses that are allowed to be attempted on the web. */
const ATTEMPTABLE = new Set<ProviderDefinition['webStatus']>([
  'browser-direct',
  'worker-metadata-only',
  'iframe',
]);

/** Statuses that may appear in the picker at all. */
const LISTABLE = new Set<ProviderDefinition['webStatus']>([
  ...ATTEMPTABLE,
  'unverified',
  'permission-pending',
]);

export function getProvider(id: string): ProviderDefinition | undefined {
  return BY_ID.get(id);
}

export function isAttemptable(provider: ProviderDefinition): boolean {
  return ATTEMPTABLE.has(provider.webStatus);
}

export function isListable(provider: ProviderDefinition): boolean {
  return LISTABLE.has(provider.webStatus);
}

export function embedChildrenOf(providerId: string): ProviderDefinition[] {
  return PROVIDERS.filter((provider) => provider.embedParent === providerId);
}

export function providersForWeb(hideAdult = false): ProviderDefinition[] {
  return PROVIDERS.filter(
    (provider) => isListable(provider) && (!hideAdult || !provider.capabilities.adultOnly)
  );
}



