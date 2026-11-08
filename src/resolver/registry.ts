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
  };
}

const ANIVEXA: ProviderDefinition[] = [
  anivexa('anipm'),
  anivexa('anichan', { status: 'worker-metadata-only', subtitles: ['soft', 'external'] }),
  anivexa('zoko', { audio: ['sub', 'dub'], subtitles: ['soft', 'external'], status: 'unavailable' }),
  anivexa('animepahe', { status: 'native-only' }),
  anivexa('rareanimes'),
  anivexa('anidbapp'),
  anivexa('animeheaven', { status: 'worker-metadata-only' }),
  anivexa('animeonsen'),
  anivexa('anikoto'),
  anivexa('kaa', { name: 'KickAssAnime' }),
  anivexa('allanime', { name: 'MKissa (AllAnime)', status: 'native-only' }),
  anivexa('animekai'),
  anivexa('reanime', { status: 'native-only' }),
  anivexa('anizone'),
  anivexa('animegg'),
  anivexa('anineko'),
  anivexa('2dhive'),
  anivexa('animedekho'),
  anivexa('toonhub', { name: 'ToonHub4u' }),
  anivexa('uniquestream'),
  anivexa('animekhor'),
  anivexa('kartoons', { name: 'Kartoons (Hindi)', language: 'Hindi', audio: ['dub'] }),
  anivexa('animeav1', { name: 'AnimeAV1 (Espanol)', language: 'Spanish' }),
  anivexa('rift', { name: 'AnimeRift (Arabic)', language: 'Arabic' }),
  anivexa('hanime', { status: 'native-only', adultOnly: true }),
  anivexa('hentaihaven', { status: 'native-only', adultOnly: true }),
  anivexa('hstream', { formats: ['dash'], adultOnly: true }),
];

const OTHER: ProviderDefinition[] = [
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
