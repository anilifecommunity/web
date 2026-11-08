/**
 * Normalized resolver contracts.
 *
 * `PlaybackOffer` mirrors `contracts/playback-offer.v1.schema.json`. Provider entries mirror
 * `contracts/provider.v1.schema.json` and are derived from the Android reference catalogue
 * (`data/ProviderCatalog.kt`), not invented here.
 */

export type RightsStatus = 'approved' | 'pending' | 'denied' | 'unknown';
export type BrowserSupport = 'supported' | 'unsupported' | 'unknown';
export type OfferAudio = 'sub' | 'dub' | 'multi' | 'unknown';
export type StreamFormat = 'hls' | 'mp4' | 'dash';

export type WebStatus =
  | 'unverified'
  | 'browser-direct'
  | 'worker-metadata-only'
  | 'iframe'
  | 'native-only'
  | 'unavailable'
  | 'permission-pending';

export type ProviderCatalogue = 'miruro' | 'anivexa' | 'other';

export interface ProviderCapabilities {
  audio?: Array<'sub' | 'dub' | 'multi'>;
  subtitles?: Array<'soft' | 'hard' | 'external'>;
  formats?: Array<StreamFormat | 'iframe' | 'unknown'>;
  regions?: string[];
  adultOnly?: boolean;
}

export interface ProviderEvidence {
  date: string;
  test: string;
  browser?: string;
  url?: string;
}

export interface ProviderDefinition {
  id: string;
  catalogue: ProviderCatalogue;
  displayName: string;
  androidId?: string;
  capabilities: ProviderCapabilities;
  webStatus: WebStatus;
  rightsStatus: RightsStatus;
  /** Miruro embed children point at the native parent whose episode id they reuse. */
  embedParent?: string;
  /** One language a provider serves exclusively, when it is not English. */
  declaredLanguage?: string;
  evidence?: ProviderEvidence[];
}

export interface PlaybackStream {
  format: StreamFormat;
  audio: OfferAudio;
  url: string;
  quality?: string | null;
  expiresAt?: string | null;
}

export interface PlaybackSubtitle {
  language: string;
  url: string;
  label?: string;
  kind?: 'vtt' | 'srt' | 'unknown';
}

export interface SkipWindow {
  kind: 'intro' | 'outro' | 'recap' | 'filler';
  startMs: number;
  endMs: number;
}

export interface PlaybackOffer {
  schemaVersion: 1;
  aniListId: number;
  malId?: number | null;
  episodeRef: string;
  providerId: string;
  rightsStatus: RightsStatus;
  browserSupport: BrowserSupport;
  streams: PlaybackStream[];
  subtitles: PlaybackSubtitle[];
  skipWindows?: SkipWindow[];
  errorCode?: string;
}

export interface ResolveRequest {
  aniListId: number;
  malId?: number | null;
  episodeRef: string;
  /** Requested audio. Never silently replaced by a different track. */
  audio: OfferAudio;
  subtitleLanguage?: string;
  /** soft = selectable tracks, hard = burned in. */
  variant?: 'soft' | 'hard';
  qualityCeiling?: string | null;
}

export interface SelectionPolicy {
  selectedProvider?: string | null;
  preferredOrder?: string[];
  enabled?: string[];
  hideAdult?: boolean;
  preferredLanguage?: string;
  /** When false, a failed explicit selection is reported instead of replaced. */
  allowFallback: boolean;
}

export interface AdapterContext {
  signal: AbortSignal;
  timeoutMs: number;
}

export type ProviderAdapter = (request: ResolveRequest, context: AdapterContext) => Promise<PlaybackOffer>;

export interface AttemptResult {
  providerId: string;
  ok: boolean;
  reason?: string;
  androidCode?: string;
}

export type ResolveResult =
  | { ok: true; offer: PlaybackOffer; attempts: AttemptResult[] }
  | { ok: false; reason: string; androidCode: string; attempts: AttemptResult[] };
