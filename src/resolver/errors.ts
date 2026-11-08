/**
 * Resolver failure taxonomy.
 *
 * `reason` is the machine value the UI and diagnostics use. `androidCode` maps onto the
 * Anilife Android error catalogue (docs/ERROR_CODES.md) so one failure reads the same on both
 * platforms. Browser-only failures are mapped to the closest existing SRC code rather than
 * inventing a parallel catalogue.
 */

export const RESOLVER_REASONS = [
  'unknown_provider',
  'disabled',
  'not_available_on_web',
  'permission_required',
  'provider_unavailable',
  'browser_cors',
  'browser_header_required',
  'browser_codec',
  'geo_restricted',
  'auth_required',
  'expired',
  'audio_unavailable',
  'timeout',
  'invalid_response',
  'no_streams',
  'unknown',
] as const;

export type ResolverReason = (typeof RESOLVER_REASONS)[number];

const ANDROID_CODES: Record<ResolverReason, string> = {
  unknown_provider: 'SRC-01',
  disabled: 'SRC-03',
  not_available_on_web: 'SRC-04',
  permission_required: 'SRC-06',
  provider_unavailable: 'SRC-04',
  browser_cors: 'SRC-06',
  browser_header_required: 'SRC-06',
  browser_codec: 'SRC-07',
  geo_restricted: 'SRC-07',
  auth_required: 'ACC-02',
  expired: 'SRC-05',
  audio_unavailable: 'SRC-04',
  timeout: 'SRC-05',
  invalid_response: 'SRC-05',
  no_streams: 'SRC-03',
  unknown: 'SRC-05',
};

export const REASON_MESSAGES: Record<ResolverReason, string> = {
  unknown_provider: 'That server is not in this build.',
  disabled: 'That server is turned off in settings.',
  not_available_on_web: 'That server cannot play in a browser.',
  permission_required: 'This server is not cleared for the web player yet.',
  provider_unavailable: 'This server has nothing playable for this episode.',
  browser_cors: 'This server blocks browser playback.',
  browser_header_required: 'This server needs a request header a browser cannot send.',
  browser_codec: 'This browser cannot decode this stream.',
  geo_restricted: 'This server is not available in your region.',
  auth_required: 'Sign in to this server to continue.',
  expired: 'This stream link expired. Resolve it again.',
  audio_unavailable: 'This server has no track in the audio you chose.',
  timeout: 'This server took too long to answer.',
  invalid_response: 'This server returned something unreadable.',
  no_streams: 'No server has a playable copy of this episode.',
  unknown: 'Something went wrong while resolving this episode.',
};

export class ResolverError extends Error {
  readonly reason: ResolverReason;
  readonly androidCode: string;

  constructor(reason: ResolverReason, message?: string) {
    super(message ?? REASON_MESSAGES[reason]);
    this.name = 'ResolverError';
    this.reason = reason;
    this.androidCode = ANDROID_CODES[reason];
  }
}

export function androidCodeFor(reason: string): string {
  if ((RESOLVER_REASONS as readonly string[]).includes(reason)) {
    return ANDROID_CODES[reason as ResolverReason];
  }
  return ANDROID_CODES.unknown;
}

export function messageFor(reason: string): string {
  if ((RESOLVER_REASONS as readonly string[]).includes(reason)) {
    return REASON_MESSAGES[reason as ResolverReason];
  }
  return REASON_MESSAGES.unknown;
}
