import type { ProviderAdapter } from '../../src/resolver';
import { resolveAnichan } from './anichan';
import { resolveAnimeHeaven } from './animeheaven';
import { resolveReanime } from './reanime';
import { resolveVidSrc } from './vidsrc';
import { resolveEmbedAggregator } from './embedAggregators';
import { resolveZoko } from './zoko';
import { resolveAnimeEmbed } from './animeEmbed';
import { extensionAdapters } from './extension';

/**
 * Adapters implemented in this Worker. Keyed by provider id; a provider absent here is not
 * attemptable no matter what a caller asks for.
 */
export const ADAPTERS: Record<string, ProviderAdapter> = {
  // WASM extensions first, so any native adapter below with the same id wins.
  ...extensionAdapters,
  anichan: resolveAnichan,
  zoko: resolveZoko,
  animeembed: resolveAnimeEmbed,
  animeheaven: resolveAnimeHeaven,
  reanime: resolveReanime,
  vidsrc: resolveVidSrc,
  vidlink: (request, context) => resolveEmbedAggregator('vidlink', request, context),
  vidfast: (request, context) => resolveEmbedAggregator('vidfast', request, context),
  '2embed': (request, context) => resolveEmbedAggregator('2embed', request, context),
};
