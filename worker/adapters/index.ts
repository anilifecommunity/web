import type { ProviderAdapter } from '../../src/resolver';
import { resolveAnichan } from './anichan';
import { resolveAnimeHeaven } from './animeheaven';
import { resolveReanime } from './reanime';
import { resolveVidSrc } from './vidsrc';
import { resolveEmbedAggregator } from './embedAggregators';

/**
 * Adapters implemented in this Worker. Keyed by provider id; a provider absent here is not
 * attemptable no matter what a caller asks for.
 */
export const ADAPTERS: Record<string, ProviderAdapter> = {
  anichan: resolveAnichan,
  animeheaven: resolveAnimeHeaven,
  reanime: resolveReanime,
  vidsrc: resolveVidSrc,
  vidlink: (request, context) => resolveEmbedAggregator('vidlink', request, context),
  vidfast: (request, context) => resolveEmbedAggregator('vidfast', request, context),
  '2embed': (request, context) => resolveEmbedAggregator('2embed', request, context),
};
