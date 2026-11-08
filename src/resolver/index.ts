export type {
  AdapterContext,
  AttemptResult,
  BrowserSupport,
  OfferAudio,
  PlaybackOffer,
  PlaybackStream,
  PlaybackSubtitle,
  PlaybackEmbed,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderDefinition,
  ResolveRequest,
  ResolveResult,
  RightsStatus,
  SelectionPolicy,
  SkipWindow,
  StreamFormat,
  WebStatus,
} from './types';

export {
  androidCodeFor,
  messageFor,
  REASON_MESSAGES,
  RESOLVER_REASONS,
  ResolverError,
} from './errors';
export type { ResolverReason } from './errors';

export {
  embedChildrenOf,
  getProvider,
  isAttemptable,
  isListable,
  PROVIDER_ORDER,
  PROVIDERS,
  providersForWeb,
} from './registry';

export { planAttempts, statusReason } from './policy';
export type { Preflight } from './policy';
export { assertPlaybackOffer, parsePlaybackOffer } from './validate';
export { resolvePlayback } from './resolve';
export type { ResolveOptions } from './resolve';
